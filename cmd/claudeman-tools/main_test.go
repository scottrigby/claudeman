package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMergeHooks_Basic(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	hooksPath := filepath.Join(dir, "hooks.json")

	// Create empty settings
	if err := os.WriteFile(settingsPath, []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create hooks file
	hooks := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [{"type": "command", "command": "test"}]}
    ]
  }
}`
	if err := os.WriteFile(hooksPath, []byte(hooks), 0644); err != nil {
		t.Fatal(err)
	}

	// Run merge
	if err := mergeHooks([]string{settingsPath, hooksPath}); err != nil {
		t.Fatalf("mergeHooks failed: %v", err)
	}

	// Verify result
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}

	if _, ok := result["hooks"]; !ok {
		t.Error("hooks not present in result")
	}
}

func TestMergeHooks_WrongArgs(t *testing.T) {
	if err := mergeHooks([]string{"only-one"}); err == nil {
		t.Error("expected error with wrong number of args")
	}
}

func TestRemoveHooks_Basic(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	hooksPath := filepath.Join(dir, "hooks.json")

	// Create settings with hooks
	settings := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [
        {"type": "command", "command": "keep"},
        {"type": "command", "command": "remove"}
      ]}
    ]
  }
}`
	if err := os.WriteFile(settingsPath, []byte(settings), 0644); err != nil {
		t.Fatal(err)
	}

	// Create hooks to remove
	hooks := `{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Write", "hooks": [{"type": "command", "command": "remove"}]}
    ]
  }
}`
	if err := os.WriteFile(hooksPath, []byte(hooks), 0644); err != nil {
		t.Fatal(err)
	}

	// Run remove
	if err := removeHooks([]string{settingsPath, hooksPath}); err != nil {
		t.Fatalf("removeHooks failed: %v", err)
	}

	// Verify result
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}

	hooks_section := result["hooks"].(map[string]interface{})
	post_tool_use := hooks_section["PostToolUse"].([]interface{})
	group := post_tool_use[0].(map[string]interface{})
	hook_list := group["hooks"].([]interface{})

	if len(hook_list) != 1 {
		t.Errorf("expected 1 hook, got %d", len(hook_list))
	}
}

func TestRemoveHooks_NonExistentSettings(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "nonexistent.json")
	hooksPath := filepath.Join(dir, "hooks.json")

	// Create hooks file
	if err := os.WriteFile(hooksPath, []byte(`{"hooks":{}}`), 0644); err != nil {
		t.Fatal(err)
	}

	// Should succeed without error
	if err := removeHooks([]string{settingsPath, hooksPath}); err != nil {
		t.Fatalf("removeHooks should handle non-existent settings: %v", err)
	}
}

func TestRunDeps_Basic(t *testing.T) {
	dir := t.TempDir()
	depsDir := filepath.Join(dir, "dependencies.d")

	if err := os.MkdirAll(depsDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a test script that creates a marker file
	markerPath := filepath.Join(dir, "ran")
	script := `#!/bin/bash
touch "` + markerPath + `"
`
	scriptPath := filepath.Join(depsDir, "10-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0755); err != nil {
		t.Fatal(err)
	}

	// Run deps
	if err := runDeps([]string{depsDir}); err != nil {
		t.Fatalf("runDeps failed: %v", err)
	}

	// Verify script ran
	if _, err := os.Stat(markerPath); os.IsNotExist(err) {
		t.Error("script did not run - marker file not created")
	}
}

func TestRunDeps_Order(t *testing.T) {
	dir := t.TempDir()
	depsDir := filepath.Join(dir, "dependencies.d")
	logPath := filepath.Join(dir, "order.log")

	if err := os.MkdirAll(depsDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create scripts that append their name to a log file
	for _, name := range []string{"20-second.sh", "10-first.sh", "30-third.sh"} {
		script := `#!/bin/bash
echo "` + name + `" >> "` + logPath + `"
`
		if err := os.WriteFile(filepath.Join(depsDir, name), []byte(script), 0755); err != nil {
			t.Fatal(err)
		}
	}

	// Run deps
	if err := runDeps([]string{depsDir}); err != nil {
		t.Fatalf("runDeps failed: %v", err)
	}

	// Verify order
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}

	expected := "10-first.sh\n20-second.sh\n30-third.sh\n"
	if string(data) != expected {
		t.Errorf("wrong execution order:\nexpected: %q\ngot: %q", expected, string(data))
	}
}

func TestRunDeps_NonExistentDir(t *testing.T) {
	// Should succeed without error
	if err := runDeps([]string{"/nonexistent/dir"}); err != nil {
		t.Fatalf("runDeps should handle non-existent dir: %v", err)
	}
}

func TestRunDeps_SkipsNonExecutable(t *testing.T) {
	dir := t.TempDir()
	depsDir := filepath.Join(dir, "dependencies.d")
	markerPath := filepath.Join(dir, "ran")

	if err := os.MkdirAll(depsDir, 0755); err != nil {
		t.Fatal(err)
	}

	// Create non-executable script
	script := `#!/bin/bash
touch "` + markerPath + `"
`
	scriptPath := filepath.Join(depsDir, "10-test.sh")
	if err := os.WriteFile(scriptPath, []byte(script), 0644); err != nil { // Note: 0644, not 0755
		t.Fatal(err)
	}

	// Run deps - should not fail
	if err := runDeps([]string{depsDir}); err != nil {
		t.Fatalf("runDeps failed: %v", err)
	}

	// Verify script did NOT run
	if _, err := os.Stat(markerPath); !os.IsNotExist(err) {
		t.Error("non-executable script should not have run")
	}
}
