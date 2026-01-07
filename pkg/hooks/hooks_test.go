package hooks

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMerge_EmptyTarget(t *testing.T) {
	target := &Settings{}
	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "echo hello"},
					},
				},
			},
		},
	}

	Merge(target, source)

	if len(target.Hooks) != 1 {
		t.Errorf("expected 1 hook type, got %d", len(target.Hooks))
	}

	groups := target.Hooks["PostToolUse"]
	if len(groups) != 1 {
		t.Errorf("expected 1 matcher group, got %d", len(groups))
	}

	if groups[0].Matcher != "Write|Edit" {
		t.Errorf("expected matcher 'Write|Edit', got '%s'", groups[0].Matcher)
	}

	if len(groups[0].Hooks) != 1 {
		t.Errorf("expected 1 hook, got %d", len(groups[0].Hooks))
	}
}

func TestMerge_ExistingHooks(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "existing command"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "new command"},
					},
				},
			},
		},
	}

	Merge(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups) != 1 {
		t.Errorf("expected 1 matcher group, got %d", len(groups))
	}

	if len(groups[0].Hooks) != 2 {
		t.Errorf("expected 2 hooks, got %d", len(groups[0].Hooks))
	}

	// Verify both hooks are present
	commands := make(map[string]bool)
	for _, h := range groups[0].Hooks {
		commands[h.Command] = true
	}

	if !commands["existing command"] {
		t.Error("missing 'existing command'")
	}
	if !commands["new command"] {
		t.Error("missing 'new command'")
	}
}

func TestMerge_Deduplication(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "duplicate"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "duplicate"},
						{Type: "command", Command: "new"},
					},
				},
			},
		},
	}

	Merge(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups[0].Hooks) != 2 {
		t.Errorf("expected 2 hooks (deduplicated), got %d", len(groups[0].Hooks))
	}
}

func TestMerge_Idempotent(t *testing.T) {
	target := &Settings{}
	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "test"},
					},
				},
			},
		},
	}

	// Merge twice
	Merge(target, source)
	Merge(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups[0].Hooks) != 1 {
		t.Errorf("expected 1 hook after idempotent merge, got %d", len(groups[0].Hooks))
	}
}

func TestMerge_NewMatcherGroup(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write",
					Hooks: []Hook{
						{Type: "command", Command: "write hook"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Edit",
					Hooks: []Hook{
						{Type: "command", Command: "edit hook"},
					},
				},
			},
		},
	}

	Merge(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups) != 2 {
		t.Errorf("expected 2 matcher groups, got %d", len(groups))
	}
}

func TestMerge_NewHookType(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write",
					Hooks: []Hook{
						{Type: "command", Command: "post hook"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PreToolUse": {
				{
					Matcher: "AskUserQuestion",
					Hooks: []Hook{
						{Type: "command", Command: "pre hook"},
					},
				},
			},
		},
	}

	Merge(target, source)

	if len(target.Hooks) != 2 {
		t.Errorf("expected 2 hook types, got %d", len(target.Hooks))
	}

	if _, ok := target.Hooks["PreToolUse"]; !ok {
		t.Error("missing PreToolUse hook type")
	}
}

func TestRemove_Basic(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "keep this"},
						{Type: "command", Command: "remove this"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove this"},
					},
				},
			},
		},
	}

	Remove(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups[0].Hooks) != 1 {
		t.Errorf("expected 1 hook after removal, got %d", len(groups[0].Hooks))
	}

	if groups[0].Hooks[0].Command != "keep this" {
		t.Errorf("wrong hook kept: %s", groups[0].Hooks[0].Command)
	}
}

func TestRemove_EmptyMatcherGroup(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove this"},
					},
				},
				{
					Matcher: "Bash",
					Hooks: []Hook{
						{Type: "command", Command: "keep this"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove this"},
					},
				},
			},
		},
	}

	Remove(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups) != 1 {
		t.Errorf("expected 1 matcher group after removal, got %d", len(groups))
	}

	if groups[0].Matcher != "Bash" {
		t.Errorf("wrong matcher group kept: %s", groups[0].Matcher)
	}
}

func TestRemove_EmptyHookType(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove this"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove this"},
					},
				},
			},
		},
	}

	Remove(target, source)

	if target.Hooks != nil && len(target.Hooks) > 0 {
		t.Errorf("expected empty hooks after removal, got %v", target.Hooks)
	}
}

func TestRemove_Idempotent(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "keep"},
						{Type: "command", Command: "remove"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "remove"},
					},
				},
			},
		},
	}

	// Remove twice
	Remove(target, source)
	Remove(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups[0].Hooks) != 1 {
		t.Errorf("expected 1 hook after idempotent removal, got %d", len(groups[0].Hooks))
	}
}

func TestRemove_NonExistent(t *testing.T) {
	target := &Settings{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "keep"},
					},
				},
			},
		},
	}

	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write|Edit",
					Hooks: []Hook{
						{Type: "command", Command: "does not exist"},
					},
				},
			},
		},
	}

	Remove(target, source)

	groups := target.Hooks["PostToolUse"]
	if len(groups[0].Hooks) != 1 {
		t.Errorf("expected 1 hook (unchanged), got %d", len(groups[0].Hooks))
	}
}

func TestLoadSettings_NonExistent(t *testing.T) {
	settings, err := LoadSettings("/nonexistent/path/settings.json")
	if err != nil {
		t.Errorf("unexpected error for non-existent file: %v", err)
	}

	if settings == nil {
		t.Error("expected empty settings, got nil")
	}
}

func TestLoadSettings_EmptyFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")

	if err := os.WriteFile(path, []byte{}, 0644); err != nil {
		t.Fatal(err)
	}

	settings, err := LoadSettings(path)
	if err != nil {
		t.Errorf("unexpected error for empty file: %v", err)
	}

	if settings == nil {
		t.Error("expected empty settings, got nil")
	}
}

func TestSettingsPreservesOtherFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.json")

	original := `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [{"type": "command", "command": "test"}]
      }
    ]
  },
  "permissions": {"allow": ["*"]},
  "customField": 123
}`

	if err := os.WriteFile(path, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}

	settings, err := LoadSettings(path)
	if err != nil {
		t.Fatal(err)
	}

	// Modify hooks
	source := &HooksConfig{
		Hooks: map[string][]MatcherGroup{
			"PostToolUse": {
				{
					Matcher: "Write",
					Hooks: []Hook{
						{Type: "command", Command: "new"},
					},
				},
			},
		},
	}
	Merge(settings, source)

	// Save and reload
	if err := SaveSettings(path, settings); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}

	// Check other fields are preserved
	if _, ok := result["permissions"]; !ok {
		t.Error("permissions field was not preserved")
	}

	if _, ok := result["customField"]; !ok {
		t.Error("customField was not preserved")
	}
}

func TestLoadHooksConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "hooks.json")

	content := `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {"type": "command", "command": "test command"}
        ]
      }
    ]
  }
}`

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	config, err := LoadHooksConfig(path)
	if err != nil {
		t.Fatalf("failed to load hooks config: %v", err)
	}

	if len(config.Hooks) != 1 {
		t.Errorf("expected 1 hook type, got %d", len(config.Hooks))
	}

	groups := config.Hooks["PostToolUse"]
	if len(groups) != 1 {
		t.Errorf("expected 1 matcher group, got %d", len(groups))
	}

	if groups[0].Hooks[0].Command != "test command" {
		t.Errorf("wrong command: %s", groups[0].Hooks[0].Command)
	}
}

func TestIntegration_MergeAndRemove(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	hooksPath := filepath.Join(dir, "hooks.json")

	// Start with empty settings
	if err := os.WriteFile(settingsPath, []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create hooks to add
	hooksContent := `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {"type": "command", "command": "gofmt -w"},
          {"type": "command", "command": "goimports -w"}
        ]
      }
    ]
  }
}`
	if err := os.WriteFile(hooksPath, []byte(hooksContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Load, merge, save
	settings, err := LoadSettings(settingsPath)
	if err != nil {
		t.Fatal(err)
	}

	hooksConfig, err := LoadHooksConfig(hooksPath)
	if err != nil {
		t.Fatal(err)
	}

	Merge(settings, hooksConfig)

	if err := SaveSettings(settingsPath, settings); err != nil {
		t.Fatal(err)
	}

	// Verify merge worked
	settings, _ = LoadSettings(settingsPath)
	if len(settings.Hooks["PostToolUse"][0].Hooks) != 2 {
		t.Error("merge failed")
	}

	// Now remove
	Remove(settings, hooksConfig)

	if err := SaveSettings(settingsPath, settings); err != nil {
		t.Fatal(err)
	}

	// Verify remove worked
	settings, _ = LoadSettings(settingsPath)
	if settings.Hooks != nil && len(settings.Hooks) > 0 {
		t.Error("remove failed, hooks still present")
	}
}
