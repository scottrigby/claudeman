// claudeman-tools provides CLI commands for managing Claude Code hooks and dependencies.
//
// Usage:
//
//	claudeman-tools merge-hooks <settings.json> <hooks.json>
//	claudeman-tools remove-hooks <settings.json> <hooks.json>
//	claudeman-tools run-deps <dependencies.d>
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/scottrigby/claudeman/pkg/hooks"
)

func usage() {
	fmt.Fprintln(os.Stderr, `claudeman-tools - Claude Code hooks and dependencies manager

Usage:
  claudeman-tools merge-hooks <settings.json> <hooks.json>
      Merge hooks from hooks.json into settings.json

  claudeman-tools remove-hooks <settings.json> <hooks.json>
      Remove hooks defined in hooks.json from settings.json

  claudeman-tools run-deps <dependencies.d>
      Run all executable *.sh scripts in the dependencies.d directory

Options:
  -h, --help    Show this help message`)
}

func mergeHooks(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("merge-hooks requires exactly 2 arguments: <settings.json> <hooks.json>")
	}

	settingsPath := args[0]
	hooksPath := args[1]

	// Load settings (creates empty if doesn't exist)
	settings, err := hooks.LoadSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("loading settings: %w", err)
	}

	// Load hooks to merge
	hooksConfig, err := hooks.LoadHooksConfig(hooksPath)
	if err != nil {
		return fmt.Errorf("loading hooks: %w", err)
	}

	// Merge
	hooks.Merge(settings, hooksConfig)

	// Save
	if err := hooks.SaveSettings(settingsPath, settings); err != nil {
		return fmt.Errorf("saving settings: %w", err)
	}

	fmt.Printf("Successfully merged hooks into %s\n", settingsPath)
	return nil
}

func removeHooks(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("remove-hooks requires exactly 2 arguments: <settings.json> <hooks.json>")
	}

	settingsPath := args[0]
	hooksPath := args[1]

	// Check if settings file exists
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		fmt.Printf("Settings file does not exist, nothing to remove: %s\n", settingsPath)
		return nil
	}

	// Load settings
	settings, err := hooks.LoadSettings(settingsPath)
	if err != nil {
		return fmt.Errorf("loading settings: %w", err)
	}

	// Load hooks to remove
	hooksConfig, err := hooks.LoadHooksConfig(hooksPath)
	if err != nil {
		return fmt.Errorf("loading hooks: %w", err)
	}

	// Remove
	hooks.Remove(settings, hooksConfig)

	// Save
	if err := hooks.SaveSettings(settingsPath, settings); err != nil {
		return fmt.Errorf("saving settings: %w", err)
	}

	fmt.Printf("Successfully removed hooks from %s\n", settingsPath)
	return nil
}

func runDeps(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("run-deps requires exactly 1 argument: <dependencies.d>")
	}

	depsDir := args[0]

	// Check if directory exists
	info, err := os.Stat(depsDir)
	if os.IsNotExist(err) {
		fmt.Printf("No dependencies.d directory found at %s\n", depsDir)
		return nil
	}
	if err != nil {
		return fmt.Errorf("checking dependencies directory: %w", err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory", depsDir)
	}

	// Find all .sh files
	entries, err := os.ReadDir(depsDir)
	if err != nil {
		return fmt.Errorf("reading dependencies directory: %w", err)
	}

	// Filter and sort .sh files
	var scripts []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(entry.Name(), ".sh") {
			scripts = append(scripts, entry.Name())
		}
	}
	sort.Strings(scripts) // Alphabetical order (10-go.sh before 20-python.sh)

	if len(scripts) == 0 {
		fmt.Println("No dependency scripts found")
		return nil
	}

	// Run each script
	for _, script := range scripts {
		scriptPath := filepath.Join(depsDir, script)

		// Check if executable
		info, err := os.Stat(scriptPath)
		if err != nil {
			fmt.Printf("Skipping %s: %v\n", script, err)
			continue
		}

		if info.Mode()&0111 == 0 {
			fmt.Printf("Skipping non-executable: %s\n", script)
			continue
		}

		fmt.Printf("Running dependency script: %s\n", script)

		cmd := exec.Command(scriptPath)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Env = os.Environ()

		if err := cmd.Run(); err != nil {
			return fmt.Errorf("running %s: %w", script, err)
		}
	}

	fmt.Println("All dependency scripts completed")
	return nil
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	command := os.Args[1]
	args := os.Args[2:]

	var err error

	switch command {
	case "-h", "--help", "help":
		usage()
		os.Exit(0)
	case "merge-hooks":
		err = mergeHooks(args)
	case "remove-hooks":
		err = removeHooks(args)
	case "run-deps":
		err = runDeps(args)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		usage()
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
