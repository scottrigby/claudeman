// Package hooks provides functionality for merging and removing Claude Code hooks
// from settings.json files.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
)

// Hook represents a single hook command configuration.
type Hook struct {
	Type    string `json:"type"`
	Command string `json:"command"`
}

// MatcherGroup represents a group of hooks that share the same matcher pattern.
type MatcherGroup struct {
	Matcher string `json:"matcher"`
	Hooks   []Hook `json:"hooks"`
}

// HooksConfig represents the hooks section of a settings file.
type HooksConfig struct {
	Hooks map[string][]MatcherGroup `json:"hooks,omitempty"`
}

// Settings represents a Claude Code settings.json file.
type Settings struct {
	Hooks map[string][]MatcherGroup `json:"hooks,omitempty"`
	// Preserve other fields
	Other map[string]json.RawMessage `json:"-"`
}

// UnmarshalJSON implements custom JSON unmarshaling to preserve unknown fields.
func (s *Settings) UnmarshalJSON(data []byte) error {
	// First unmarshal into a map to capture all fields
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	s.Other = make(map[string]json.RawMessage)

	for key, value := range raw {
		if key == "hooks" {
			if err := json.Unmarshal(value, &s.Hooks); err != nil {
				return err
			}
		} else {
			s.Other[key] = value
		}
	}

	return nil
}

// MarshalJSON implements custom JSON marshaling to preserve unknown fields.
func (s Settings) MarshalJSON() ([]byte, error) {
	// Build output map
	result := make(map[string]interface{})

	// Add other fields first
	for key, value := range s.Other {
		var v interface{}
		if err := json.Unmarshal(value, &v); err != nil {
			return nil, err
		}
		result[key] = v
	}

	// Add hooks if present
	if s.Hooks != nil && len(s.Hooks) > 0 {
		result["hooks"] = s.Hooks
	}

	return json.Marshal(result)
}

// hookKey generates a unique key for deduplication based on type and command.
func hookKey(h Hook) string {
	return h.Type + "::" + h.Command
}

// Merge merges hooks from source into target settings.
// It preserves existing hooks and adds new ones, avoiding duplicates.
func Merge(target *Settings, source *HooksConfig) {
	if source == nil || source.Hooks == nil {
		return
	}

	if target.Hooks == nil {
		target.Hooks = make(map[string][]MatcherGroup)
	}

	// For each hook type in source
	for hookType, sourceGroups := range source.Hooks {
		targetGroups := target.Hooks[hookType]

		// Build a map of existing matcher groups for this hook type
		byMatcher := make(map[string]*MatcherGroup)
		for i := range targetGroups {
			matcher := targetGroups[i].Matcher
			if existing, ok := byMatcher[matcher]; ok {
				// Append hooks to existing group
				existing.Hooks = append(existing.Hooks, targetGroups[i].Hooks...)
			} else {
				// Copy the group
				group := targetGroups[i]
				byMatcher[matcher] = &group
			}
		}

		// Merge in source hooks
		for _, sourceGroup := range sourceGroups {
			matcher := sourceGroup.Matcher
			if existing, ok := byMatcher[matcher]; ok {
				// Build set of existing hook keys for deduplication
				existingKeys := make(map[string]bool)
				for _, h := range existing.Hooks {
					existingKeys[hookKey(h)] = true
				}

				// Add non-duplicate hooks
				for _, h := range sourceGroup.Hooks {
					if !existingKeys[hookKey(h)] {
						existing.Hooks = append(existing.Hooks, h)
					}
				}
			} else {
				// New matcher group
				group := MatcherGroup{
					Matcher: matcher,
					Hooks:   make([]Hook, len(sourceGroup.Hooks)),
				}
				copy(group.Hooks, sourceGroup.Hooks)
				byMatcher[matcher] = &group
			}
		}

		// Convert back to slice, preserving original order where possible
		var result []MatcherGroup
		seen := make(map[string]bool)

		// First add groups in original target order
		for _, g := range targetGroups {
			if !seen[g.Matcher] {
				if merged, ok := byMatcher[g.Matcher]; ok {
					result = append(result, *merged)
				}
				seen[g.Matcher] = true
			}
		}

		// Then add any new groups from source
		for _, g := range sourceGroups {
			if !seen[g.Matcher] {
				if merged, ok := byMatcher[g.Matcher]; ok {
					result = append(result, *merged)
				}
				seen[g.Matcher] = true
			}
		}

		target.Hooks[hookType] = result
	}
}

// Remove removes hooks specified in source from target settings.
// It removes hooks that exactly match by type and command.
func Remove(target *Settings, source *HooksConfig) {
	if source == nil || source.Hooks == nil || target.Hooks == nil {
		return
	}

	// Build set of hooks to remove (keyed by type::command)
	toRemove := make(map[string]bool)
	for _, groups := range source.Hooks {
		for _, group := range groups {
			for _, h := range group.Hooks {
				toRemove[hookKey(h)] = true
			}
		}
	}

	// Filter hooks from each hook type
	for hookType, groups := range target.Hooks {
		var filteredGroups []MatcherGroup

		for _, group := range groups {
			var filteredHooks []Hook
			for _, h := range group.Hooks {
				if !toRemove[hookKey(h)] {
					filteredHooks = append(filteredHooks, h)
				}
			}

			// Only keep group if it still has hooks
			if len(filteredHooks) > 0 {
				filteredGroups = append(filteredGroups, MatcherGroup{
					Matcher: group.Matcher,
					Hooks:   filteredHooks,
				})
			}
		}

		// Update or remove the hook type
		if len(filteredGroups) > 0 {
			target.Hooks[hookType] = filteredGroups
		} else {
			delete(target.Hooks, hookType)
		}
	}

	// Remove empty hooks map
	if len(target.Hooks) == 0 {
		target.Hooks = nil
	}
}

// LoadSettings reads and parses a settings.json file.
// Returns an empty Settings if the file doesn't exist.
func LoadSettings(path string) (*Settings, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &Settings{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading settings file: %w", err)
	}

	// Handle empty file
	if len(data) == 0 {
		return &Settings{}, nil
	}

	var settings Settings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("parsing settings file: %w", err)
	}

	return &settings, nil
}

// LoadHooksConfig reads and parses a hooks.json file.
func LoadHooksConfig(path string) (*HooksConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading hooks file: %w", err)
	}

	var config HooksConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parsing hooks file: %w", err)
	}

	return &config, nil
}

// SaveSettings writes settings to a JSON file with pretty formatting.
func SaveSettings(path string, settings *Settings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling settings: %w", err)
	}

	// Add trailing newline
	data = append(data, '\n')

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("writing settings file: %w", err)
	}

	return nil
}
