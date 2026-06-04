{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Meow CLI — Unified API Schema",
  "version": "3.0.10",
  "description": "Complete API schema for external tools integration with Meow CLI. Defines all commands, tools, events, config, and data types.",
  "info": {
    "purpose": "Provides external tools (IDE extensions, web dashboards, CI systems, custom frontends) with structured access to Meow CLI functionality.",
    "transport": "HTTP REST, WebSocket, or programmatic (Node.js require/import)",
    "base_url": "http://localhost:PORT/api/v1",
    "endpoint_root": "/api/v1"
  },

  "modules": {
    "config": {
      "description": "Configuration management module",
      "methods": {
        "getConfig": {
          "description": "Get full application configuration",
          "params": {},
          "returns": { "$ref": "#/definitions/Config" }
        },
        "setConfig": {
          "description": "Update configuration values",
          "params": {
            "key": { "type": "string", "description": "Dot-notation key (e.g. 'model', 'profiles.default.temperature')" },
            "value": { "type": "any", "description": "Value to set" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "resetConfig": {
          "description": "Reset config to defaults",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "chat": {
      "description": "Chat session management",
      "methods": {
        "sendMessage": {
          "description": "Send a message to the AI and get a response (non-streaming)",
          "params": {
            "message": { "type": "string", "description": "User message text" },
            "chat": { "type": "string", "description": "Chat session name (optional, default: current)" },
            "stream": { "type": "boolean", "description": "Enable SSE streaming (default: false)" }
          },
          "returns": { "$ref": "#/definitions/ChatResponse" }
        },
        "listChats": {
          "description": "List all saved chat sessions",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/ChatSession" } }
        },
        "newChat": {
          "description": "Create a new chat session",
          "params": {
            "name": { "type": "string", "description": "Optional chat name" }
          },
          "returns": { "$ref": "#/definitions/ChatSession" }
        },
        "switchChat": {
          "description": "Switch to an existing chat session",
          "params": {
            "name": { "type": "string", "description": "Chat name to switch to" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "deleteChat": {
          "description": "Delete a chat session",
          "params": {
            "name": { "type": "string", "description": "Chat name to delete" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "clearContext": {
          "description": "Clear current chat context",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "resetContext": {
          "description": "Reset current chat context completely",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "autopilot": {
      "description": "Autonomous task execution engine",
      "methods": {
        "run": {
          "description": "Execute a task autonomously with full tool access",
          "params": {
            "task": { "type": "string", "description": "Task description" },
            "maxIterations": { "type": "number", "description": "Max iterations (1-500, default: 50)" },
            "maxErrors": { "type": "number", "description": "Max errors (1-50, default: 5)" }
          },
          "returns": { "$ref": "#/definitions/AutopilotResult" }
        },
        "getConfig": {
          "description": "View autopilot configuration",
          "params": {},
          "returns": { "$ref": "#/definitions/AutopilotConfig" }
        },
        "setConfig": {
          "description": "Set autopilot configuration",
          "params": {
            "max_iterations": { "type": "number", "description": "Max iterations (1-500)" },
            "max_errors": { "type": "number", "description": "Max errors (1-50)" },
            "trigger_cmd": { "type": "string", "description": "Trigger command pattern" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "getStatus": {
          "description": "Get current autopilot execution status",
          "params": {},
          "returns": { "$ref": "#/definitions/AutopilotStatus" }
        }
      }
    },

    "leadDev": {
      "description": "AI Lead Developer — deep analysis with parallel execution",
      "methods": {
        "run": {
          "description": "Run Lead Developer mode with advanced analysis and parallel execution",
          "params": {
            "context": { "type": "string", "description": "Task context or description" },
            "auto": { "type": "boolean", "description": "Auto-execute without confirmation (default: false)" },
            "plan": { "type": "boolean", "description": "Plan-only mode (dry run) (default: false)" },
            "focus": { "type": "string", "description": "Focus area (e.g. 'auth', 'database')" },
            "tasks": { "type": "number", "description": "Maximum parallel sub-tasks" }
          },
          "returns": { "$ref": "#/definitions/LeadDevResult" }
        }
      }
    },

    "delegate": {
      "description": "Parallel sub-agent task delegation",
      "methods": {
        "run": {
          "description": "Delegate tasks to parallel sub-agents",
          "params": {
            "task": { "type": "string", "description": "Task description for sub-agent" },
            "tasks": { "type": "array", "items": { "type": "string" }, "description": "Array of parallel tasks" }
          },
          "returns": { "$ref": "#/definitions/DelegateResult" }
        }
      }
    },

    "sessions": {
      "description": "Persistent session management",
      "methods": {
        "list": {
          "description": "List all saved sessions",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/Session" } }
        },
        "load": {
          "description": "Load a session by ID",
          "params": { "id": { "type": "string", "description": "Session ID" } },
          "returns": { "$ref": "#/definitions/SessionData" }
        },
        "save": {
          "description": "Save current state as a session",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "delete": {
          "description": "Delete a session",
          "params": { "id": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "checkpoints": {
      "description": "File system checkpoint and rollback system",
      "methods": {
        "rewind": {
          "description": "Undo the last N file changes",
          "params": {
            "steps": { "type": "number", "description": "Number of checkpoints to rewind (default: 1)" }
          },
          "returns": { "$ref": "#/definitions/RewindResult" }
        },
        "list": {
          "description": "List all checkpoints",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/Checkpoint" } }
        }
      }
    },

    "memory": {
      "description": "RAG memory system — learns from interactions",
      "methods": {
        "getStats": {
          "description": "Get memory statistics",
          "params": {},
          "returns": { "$ref": "#/definitions/MemoryStats" }
        },
        "search": {
          "description": "Search memory for relevant context",
          "params": {
            "query": { "type": "string" },
            "maxResults": { "type": "number", "default": 10 }
          },
          "returns": { "type": "array", "items": { "$ref": "#/definitions/MemoryEntry" } }
        },
        "add": {
          "description": "Add an entry to memory",
          "params": {
            "type": { "type": "string", "enum": ["pattern", "decision", "error", "preference"] },
            "content": { "type": "string" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "clear": {
          "description": "Clear memory for a project or all",
          "params": {
            "project": { "type": "string", "description": "Project ID or '--all'" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "getPreferences": {
          "description": "Get learned user preferences",
          "params": {},
          "returns": { "type": "object" }
        }
      }
    },

    "provider": {
      "description": "Multi-provider API management",
      "methods": {
        "list": {
          "description": "List all configured API providers",
          "params": {},
          "returns": { "type": "object", "additionalProperties": { "$ref": "#/definitions/Provider" } }
        },
        "add": {
          "description": "Add a new API provider",
          "params": {
            "id": { "type": "string" },
            "base_url": { "type": "string" },
            "api_key": { "type": "string" },
            "model": { "type": "string" },
            "api_schema": { "type": "string", "enum": ["openai", "claude", "gemini"] }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "switch": {
          "description": "Switch to a provider",
          "params": { "id": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "delete": {
          "description": "Delete a provider",
          "params": { "id": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setCustomValues": {
          "description": "Set custom headers, body params, or query params for a provider",
          "params": {
            "providerId": { "type": "string" },
            "headers": { "type": "object" },
            "body_params": { "type": "object" },
            "query_params": { "type": "object" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "tools": {
      "description": "Direct access to all AI tools for external use",
      "methods": {
        "listDir": {
          "description": "List files and directories at a path",
          "params": { "path": { "type": "string" }, "recursive": { "type": "boolean" } },
          "returns": { "type": "string" }
        },
        "readFile": {
          "description": "Read file contents (truncated to 50KB)",
          "params": { "path": { "type": "string" }, "start_line": { "type": "number" }, "end_line": { "type": "number" } },
          "returns": { "type": "string" }
        },
        "writeFile": {
          "description": "Create or overwrite a file",
          "params": { "path": { "type": "string" }, "content": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "patchFile": {
          "description": "Apply targeted edit to a file (replace text)",
          "params": { "path": { "type": "string" }, "old_string": { "type": "string" }, "new_string": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "grepSearch": {
          "description": "Search files with regex pattern",
          "params": { "pattern": { "type": "string" }, "path": { "type": "string" }, "include": { "type": "string" }, "max_results": { "type": "number" } },
          "returns": { "type": "array", "items": { "$ref": "#/definitions/GrepResult" } }
        },
        "runShell": {
          "description": "Execute a shell command",
          "params": { "cmd": { "type": "string" } },
          "returns": { "type": "string" }
        },
        "httpRequest": {
          "description": "Make an HTTP request",
          "params": { "url": { "type": "string" }, "method": { "type": "string", "enum": ["GET","POST","PUT","PATCH","DELETE"] }, "headers": { "type": "object" }, "body": { "type": "string" }, "timeout_ms": { "type": "number" } },
          "returns": { "type": "string" }
        },
        "webSearch": {
          "description": "Search the web using DuckDuckGo",
          "params": { "query": { "type": "string" }, "max_results": { "type": "number" } },
          "returns": { "type": "string" }
        },
        "gitDiff": {
          "description": "Show git diff",
          "params": { "file": { "type": "string" }, "staged": { "type": "boolean" } },
          "returns": { "type": "string" }
        },
        "gitLog": {
          "description": "Show recent git commits",
          "params": { "count": { "type": "number" }, "file": { "type": "string" } },
          "returns": { "type": "string" }
        },
        "gitCommit": {
          "description": "Stage and commit changes",
          "params": { "message": { "type": "string" }, "files": { "type": "array", "items": { "type": "string" } } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "gitBranch": {
          "description": "List, create, or checkout branches",
          "params": { "name": { "type": "string" }, "create": { "type": "boolean" }, "checkout": { "type": "boolean" } },
          "returns": { "type": "string" }
        },
        "ciPipeline": {
          "description": "Manage CI/CD pipelines",
          "params": { "action": { "type": "string", "enum": ["status","generate","heal"] }, "name": { "type": "string" }, "description": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "askUser": {
          "description": "Ask user a question for input",
          "params": { "question": { "type": "string" }, "default": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "confirm": {
          "description": "Ask user for yes/no confirmation",
          "params": { "message": { "type": "string" }, "default": { "type": "boolean" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "choose": {
          "description": "Present options to user for selection",
          "params": { "question": { "type": "string" }, "options": { "type": "array", "items": { "type": "string" } }, "default_index": { "type": "number" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "toolChain": {
          "description": "Execute multiple tools in sequence",
          "params": { "steps": { "type": "array", "items": { "$ref": "#/definitions/ToolStep" } } },
          "returns": { "type": "array", "items": { "type": "any" } }
        },
        "delegateTask": {
          "description": "Spawn parallel sub-agents for a task",
          "params": { "tasks": { "type": "array", "items": { "type": "object", "properties": { "description": { "type": "string" }, "max_tokens": { "type": "number" }, "tools": { "type": "array", "items": { "type": "string" } } } } } },
          "returns": { "type": "array", "items": { "type": "object" } }
        }
      }
    },

    "images": {
      "description": "Image analysis",
      "methods": {
        "analyze": {
          "description": "Analyze an image from local path or URL",
          "params": {
            "path": { "type": "string", "description": "Local file path or URL" },
            "question": { "type": "string", "description": "Optional question about the image" }
          },
          "returns": { "$ref": "#/definitions/ImageAnalysisResult" }
        },
        "queue": {
          "description": "Queue an image for next message",
          "params": {
            "path": { "type": "string", "description": "Local file path or URL" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "permissions": {
      "description": "Tool permission management",
      "methods": {
        "list": {
          "description": "List all permission rules",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/PermissionRule" } }
        },
        "allow": {
          "description": "Add allow rule for a tool",
          "params": { "tool": { "type": "string" }, "path": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "deny": {
          "description": "Add deny rule for a tool",
          "params": { "tool": { "type": "string" }, "path": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "ask": {
          "description": "Remove rule for a tool (will ask)",
          "params": { "tool": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "reset": {
          "description": "Reset all rules to defaults",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "security": {
      "description": "Security management",
      "methods": {
        "auditShow": {
          "description": "Show recent security audit log",
          "params": { "count": { "type": "number", "default": 30 } },
          "returns": { "type": "array", "items": { "$ref": "#/definitions/AuditEntry" } }
        },
        "auditClear": {
          "description": "Clear audit log",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "incognitoOn": {
          "description": "Enable incognito mode (no data persists)",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "incognitoOff": {
          "description": "Disable incognito mode",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "incognitoStatus": {
          "description": "Check incognito mode status",
          "params": {},
          "returns": { "type": "boolean" }
        },
        "trustStatus": {
          "description": "Check trust status",
          "params": {},
          "returns": { "type": "string", "enum": ["trusted", "untrusted", "blacklisted"] }
        },
        "trustGrant": {
          "description": "Grant trust (allow full access)",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "plugins": {
      "description": "Plugin system management",
      "methods": {
        "list": {
          "description": "List all plugins",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/Plugin" } }
        },
        "enable": {
          "description": "Enable a plugin",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "disable": {
          "description": "Disable a plugin",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "reload": {
          "description": "Reload all plugins",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "getDirectory": {
          "description": "Get plugin directory path",
          "params": {},
          "returns": { "type": "string" }
        }
      }
    },

    "mcp": {
      "description": "Model Context Protocol server management",
      "methods": {
        "list": {
          "description": "List all MCP servers and their tools",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/McpServer" } }
        },
        "add": {
          "description": "Add and connect a new MCP server",
          "params": {
            "name": { "type": "string" },
            "command": { "type": "string", "description": "CLI command for stdio transport" },
            "args": { "type": "array", "items": { "type": "string" } },
            "url": { "type": "string", "description": "URL for SSE transport" },
            "env": { "type": "object", "description": "Environment variables" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "remove": {
          "description": "Remove an MCP server",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "refresh": {
          "description": "Refresh tools from all MCP servers",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "cost": {
      "description": "Token usage and cost tracking",
      "methods": {
        "getSession": {
          "description": "Get current session cost info",
          "params": {},
          "returns": { "$ref": "#/definitions/CostInfo" }
        },
        "getTotal": {
          "description": "Get total cost info (all sessions)",
          "params": {},
          "returns": { "$ref": "#/definitions/CostInfo" }
        },
        "reset": {
          "description": "Reset cost history",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "smart": {
      "description": "Smart features: model routing, prompt optimization, pair programming, CI/CD",
      "methods": {
        "routingStatus": {
          "description": "Get smart routing status and config",
          "params": {},
          "returns": { "$ref": "#/definitions/RoutingConfig" }
        },
        "routingOn": {
          "description": "Enable smart model routing",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "routingOff": {
          "description": "Disable smart model routing",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "routingSetModel": {
          "description": "Set a model for a complexity tier",
          "params": {
            "tier": { "type": "string", "enum": ["fast", "balanced", "powerful"] },
            "model": { "type": "string" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "optimizerStatus": {
          "description": "Get prompt optimizer status",
          "params": {},
          "returns": { "$ref": "#/definitions/OptimizerConfig" }
        },
        "optimizerOn": {
          "description": "Enable prompt optimizer",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "optimizerOff": {
          "description": "Disable prompt optimizer",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "optimizerSetModel": {
          "description": "Set optimizer model (empty for main model)",
          "params": { "model": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "pairStatus": {
          "description": "Get pair programming mode status",
          "params": {},
          "returns": { "$ref": "#/definitions/PairStatus" }
        },
        "pairSetMode": {
          "description": "Set pair programming mode",
          "params": { "mode": { "type": "string", "enum": ["verbose", "balanced", "silent", "off"] } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "previewStart": {
          "description": "Start live preview dev server",
          "params": {},
          "returns": { "$ref": "#/definitions/PreviewStatus" }
        },
        "previewStop": {
          "description": "Stop live preview dev server",
          "params": {},
          "returns": { "$ref": "#/definitions/PreviewStatus" }
        },
        "previewStatus": {
          "description": "Get preview server status",
          "params": {},
          "returns": { "$ref": "#/definitions/PreviewStatus" }
        },
        "ciStatus": {
          "description": "Get CI/CD status",
          "params": {},
          "returns": { "$ref": "#/definitions/CIStatus" }
        },
        "ciGenerate": {
          "description": "Generate a CI workflow",
          "params": { "description": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "ciHeal": {
          "description": "Run CI self-healing",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "project": {
      "description": "Project initialization and indexing",
      "methods": {
        "init": {
          "description": "Initialize project index (project.meow + MEOW.md)",
          "params": { "force": { "type": "boolean", "default": false } },
          "returns": { "$ref": "#/definitions/InitResult" }
        },
        "indexStatus": {
          "description": "Get file index statistics",
          "params": {},
          "returns": { "$ref": "#/definitions/IndexStats" }
        },
        "indexRebuild": {
          "description": "Rebuild file index",
          "params": {},
          "returns": { "$ref": "#/definitions/IndexRebuildResult" }
        },
        "indexUpdate": {
          "description": "Incrementally update file index",
          "params": {},
          "returns": { "$ref": "#/definitions/IndexUpdateResult" }
        },
        "findFiles": {
          "description": "Search files by name in the index",
          "params": { "query": { "type": "string" } },
          "returns": { "type": "array", "items": { "$ref": "#/definitions/FileInfo" } }
        },
        "contextShow": {
          "description": "Show current project context (MEOW.md)",
          "params": {},
          "returns": { "$ref": "#/definitions/ContextInfo" }
        },
        "contextReload": {
          "description": "Reload project context into system prompt",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "assistants": {
      "description": "Assistant profile management",
      "methods": {
        "list": {
          "description": "List all assistant profiles",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/Assistant" } }
        },
        "create": {
          "description": "Create a new assistant profile",
          "params": {
            "name": { "type": "string" },
            "system": { "type": "string", "description": "System prompt" },
            "temperature": { "type": "number", "default": 0.2 }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "switch": {
          "description": "Switch to an assistant profile",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "show": {
          "description": "Show assistant profile details",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/Assistant" }
        }
      }
    },

    "settings": {
      "description": "General settings",
      "methods": {
        "setApiKey": {
          "description": "Set API key",
          "params": { "key": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setApiUrl": {
          "description": "Set API base URL",
          "params": { "url": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setModel": {
          "description": "Set active model",
          "params": { "model": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setTemperature": {
          "description": "Set model temperature (0.0-2.0)",
          "params": { "temperature": { "type": "number" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setLanguage": {
          "description": "Set UI language",
          "params": { "lang": { "type": "string", "enum": ["ru", "en"] } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setTheme": {
          "description": "Set UI theme",
          "params": { "theme": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "setProfile": {
          "description": "Switch to a configuration profile",
          "params": { "name": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "getGitConfig": {
          "description": "Get git integration settings",
          "params": {},
          "returns": { "$ref": "#/definitions/GitConfig" }
        },
        "setGitConfig": {
          "description": "Set git integration settings",
          "params": {
            "autocommit": { "type": "boolean" },
            "prefix": { "type": "string" },
            "ai_message": { "type": "boolean" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "getVacuum": {
          "description": "Get context vacuum settings",
          "params": {},
          "returns": { "$ref": "#/definitions/VacuumConfig" }
        },
        "setVacuum": {
          "description": "Set context vacuum settings",
          "params": {
            "enabled": { "type": "boolean" },
            "drop_count": { "type": "number" },
            "keep_last": { "type": "number" }
          },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "compact": {
      "description": "Context compression",
      "methods": {
        "run": {
          "description": "Compact conversation context to save tokens",
          "params": {
            "useAI": { "type": "boolean", "default": false, "description": "Use AI summarization" },
            "keepRecent": { "type": "number", "default": 4, "description": "Number of recent messages to keep" }
          },
          "returns": { "$ref": "#/definitions/CompactResult" }
        }
      }
    },

    "pins": {
      "description": "Pinned message management",
      "methods": {
        "list": {
          "description": "List all pinned messages",
          "params": {},
          "returns": { "type": "array", "items": { "$ref": "#/definitions/Pin" } }
        },
        "add": {
          "description": "Pin a message by index (default: last)",
          "params": { "index": { "type": "number", "description": "1-based message index" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    },

    "misc": {
      "description": "Miscellaneous commands",
      "methods": {
        "getAliases": {
          "description": "Get command aliases",
          "params": {},
          "returns": { "type": "object", "additionalProperties": { "type": "string" } }
        },
        "exportHistory": {
          "description": "Export chat history to JSON file",
          "params": { "file": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "importHistory": {
          "description": "Import chat history from JSON file",
          "params": { "file": { "type": "string" } },
          "returns": { "$ref": "#/definitions/ApiResponse" }
        },
        "renderTemplate": {
          "description": "Render a template with parameters",
          "params": { "name": { "type": "string" }, "params": { "type": "object" } },
          "returns": { "type": "string" }
        },
        "getStats": {
          "description": "Get session statistics",
          "params": {},
          "returns": { "$ref": "#/definitions/Stats" }
        },
        "getVersion": {
          "description": "Get CLI version and check for updates",
          "params": {},
          "returns": { "$ref": "#/definitions/VersionInfo" }
        }
      }
    },

    "system": {
      "description": "System-level operations",
      "methods": {
        "health": {
          "description": "Health check endpoint",
          "params": {},
          "returns": { "$ref": "#/definitions/HealthStatus" }
        },
        "shutdown": {
          "description": "Gracefully shutdown the CLI",
          "params": {},
          "returns": { "$ref": "#/definitions/ApiResponse" }
        }
      }
    }
  },

  "definitions": {
    "ApiResponse": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "message": { "type": "string" },
        "data": {}
      }
    },

    "Config": {
      "type": "object",
      "properties": {
        "api_base": { "type": "string" },
        "api_key": { "type": "string" },
        "model": { "type": "string" },
        "auto_yes": { "type": "boolean" },
        "quiet": { "type": "boolean" },
        "profile": { "type": "string" },
        "theme": { "type": "string" },
        "lang": { "type": "string", "enum": ["ru", "en"] },
        "api_schema": { "type": "string", "enum": ["openai", "claude", "gemini"] },
        "active_provider": { "type": "string" },
        "git": { "$ref": "#/definitions/GitConfig" },
        "autopilot": { "$ref": "#/definitions/AutopilotConfig" },
        "prompt_optimizer": { "$ref": "#/definitions/OptimizerConfig" },
        "smart_routing": { "$ref": "#/definitions/RoutingConfig" },
        "plugins": { "type": "object" },
        "vacuum": { "$ref": "#/definitions/VacuumConfig" },
        "profiles": { "type": "object", "additionalProperties": { "$ref": "#/definitions/Assistant" } },
        "aliases": { "type": "object", "additionalProperties": { "type": "string" } },
        "providers": { "type": "object", "additionalProperties": { "$ref": "#/definitions/Provider" } },
        "mcp_servers": { "type": "object" }
      }
    },

    "Provider": {
      "type": "object",
      "properties": {
        "base_url": { "type": "string" },
        "api_key": { "type": "string" },
        "model": { "type": "string" },
        "api_schema": { "type": "string", "enum": ["openai", "claude", "gemini"] },
        "rpm_limit": { "type": "number" },
        "custom_values": {
          "type": "object",
          "properties": {
            "headers": { "type": "object" },
            "body_params": { "type": "object" },
            "query_params": { "type": "object" }
          }
        }
      }
    },

    "ChatSession": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "messageCount": { "type": "number" },
        "isCurrent": { "type": "boolean" }
      }
    },

    "ChatResponse": {
      "type": "object",
      "properties": {
        "content": { "type": "string" },
        "model": { "type": "string" },
        "usage": {
          "type": "object",
          "properties": {
            "prompt_tokens": { "type": "number" },
            "completion_tokens": { "type": "number" },
            "total_tokens": { "type": "number" }
          }
        },
        "tool_calls": { "type": "array", "items": { "type": "object" } }
      }
    },

    "AutopilotConfig": {
      "type": "object",
      "properties": {
        "max_iterations": { "type": "number" },
        "max_errors": { "type": "number" },
        "retry_delay_ms": { "type": "number" },
        "save_log": { "type": "boolean" },
        "trigger_cmd": { "type": "string" }
      }
    },

    "AutopilotResult": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "iterations": { "type": "number" },
        "errors": { "type": "number" },
        "changes": { "type": "array", "items": { "type": "string" } },
        "log": { "type": "string" }
      }
    },

    "AutopilotStatus": {
      "type": "object",
      "properties": {
        "running": { "type": "boolean" },
        "currentStep": { "type": "string" },
        "iteration": { "type": "number" },
        "maxIterations": { "type": "number" }
      }
    },

    "LeadDevResult": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "plan": { "type": "string" },
        "subTasks": { "type": "array", "items": { "type": "object" } },
        "changes": { "type": "array", "items": { "type": "string" } },
        "summary": { "type": "string" }
      }
    },

    "DelegateResult": {
      "type": "object",
      "properties": {
        "results": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "status": { "type": "string", "enum": ["done", "error", "timeout"] },
              "iterations": { "type": "number" },
              "toolCalls": { "type": "number" },
              "tokensUsed": { "type": "number" },
              "costUsd": { "type": "number" },
              "result": { "type": "string" }
            }
          }
        }
      }
    },

    "Session": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "created": { "type": "string" },
        "messageCount": { "type": "number" },
        "model": { "type": "string" },
        "cwd": { "type": "string" }
      }
    },

    "SessionData": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "messages": { "type": "array" },
        "messagesCount": { "type": "number" },
        "model": { "type": "string" },
        "cwd": { "type": "string" }
      }
    },

    "RewindResult": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "stepsRewound": { "type": "number" },
        "restored": { "type": "array", "items": { "type": "string" } },
        "errors": { "type": "array", "items": { "type": "string" } },
        "remaining": { "type": "number" }
      }
    },

    "Checkpoint": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "timestamp": { "type": "number" },
        "files": { "type": "number" }
      }
    },

    "MemoryStats": {
      "type": "object",
      "properties": {
        "total": { "type": "number" },
        "byType": { "type": "object" },
        "projects": { "type": "number" }
      }
    },

    "MemoryEntry": {
      "type": "object",
      "properties": {
        "memory": {
          "type": "object",
          "properties": {
            "type": { "type": "string" },
            "content": { "type": "string" }
          }
        },
        "similarity": { "type": "number" }
      }
    },

    "GrepResult": {
      "type": "object",
      "properties": {
        "file": { "type": "string" },
        "line": { "type": "number" },
        "content": { "type": "string" }
      }
    },

    "ImageAnalysisResult": {
      "type": "object",
      "properties": {
        "content": { "type": "string" },
        "usage": { "type": "object" }
      }
    },

    "PermissionRule": {
      "type": "object",
      "properties": {
        "tool": { "type": "string" },
        "level": { "type": "string", "enum": ["allow", "deny", "ask"] },
        "path": { "type": "string" }
      }
    },

    "AuditEntry": {
      "type": "object",
      "properties": {
        "timestamp": { "type": "string" },
        "action": { "type": "string" },
        "tool": { "type": "string" },
        "allowed": { "type": "boolean" }
      }
    },

    "Plugin": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "enabled": { "type": "boolean" },
        "version": { "type": "string" },
        "description": { "type": "string" },
        "error": { "type": "string" }
      }
    },

    "McpServer": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "status": { "type": "string", "enum": ["running", "error", "stopped"] },
        "tools": { "type": "number" },
        "command": { "type": "string" }
      }
    },

    "CostInfo": {
      "type": "object",
      "properties": {
        "totalTokens": { "type": "number" },
        "totalCostUsd": { "type": "number" },
        "breakdown": { "type": "object" }
      }
    },

    "RoutingConfig": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "fast_model": { "type": "string" },
        "balanced_model": { "type": "string" },
        "powerful_model": { "type": "string" }
      }
    },

    "OptimizerConfig": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "model": { "type": "string" },
        "verbose": { "type": "boolean" }
      }
    },

    "PairStatus": {
      "type": "object",
      "properties": {
        "mode": { "type": "string", "enum": ["verbose", "balanced", "silent", "off"] }
      }
    },

    "PreviewStatus": {
      "type": "object",
      "properties": {
        "running": { "type": "boolean" },
        "pid": { "type": "number" },
        "cmd": { "type": "string" },
        "error": { "type": "string" }
      }
    },

    "CIStatus": {
      "type": "object",
      "properties": {
        "provider": { "type": "string" },
        "workflows": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "file": { "type": "string" }
            }
          }
        }
      }
    },

    "InitResult": {
      "type": "object",
      "properties": {
        "success": { "type": "boolean" },
        "projectMeow": { "type": "string", "description": "Path to project.meow" },
        "meowMd": { "type": "string", "description": "Path to MEOW.md" },
        "indexed": { "type": "number", "description": "Files indexed" }
      }
    },

    "IndexStats": {
      "type": "object",
      "properties": {
        "exists": { "type": "boolean" },
        "fileCount": { "type": "number" },
        "dbSize": { "type": "string" },
        "lastFullIndex": { "type": "string" },
        "rootPath": { "type": "string" }
      }
    },

    "IndexRebuildResult": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "files": { "type": "number" },
        "dbSize": { "type": "string" },
        "elapsed": { "type": "string" }
      }
    },

    "IndexUpdateResult": {
      "type": "object",
      "properties": {
        "ok": { "type": "boolean" },
        "total": { "type": "number" },
        "updated": { "type": "number" },
        "added": { "type": "number" },
        "removed": { "type": "number" },
        "message": { "type": "string" }
      }
    },

    "FileInfo": {
      "type": "object",
      "properties": {
        "path": { "type": "string" },
        "size": { "type": "number" },
        "mtime": { "type": "number" }
      }
    },

    "ContextInfo": {
      "type": "object",
      "properties": {
        "files": { "type": "array", "items": { "type": "string" } },
        "totalChars": { "type": "number" },
        "totalTokens": { "type": "number" }
      }
    },

    "Assistant": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "system": { "type": "string" },
        "temperature": { "type": "number" }
      }
    },

    "GitConfig": {
      "type": "object",
      "properties": {
        "autocommit": { "type": "boolean" },
        "prefix": { "type": "string" },
        "ai_message": { "type": "boolean" },
        "ai_max_diff_chars": { "type": "number" }
      }
    },

    "VacuumConfig": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean" },
        "keep_last": { "type": "number" },
        "drop_count": { "type": "number" }
      }
    },

    "CompactResult": {
      "type": "object",
      "properties": {
        "compressed": { "type": "boolean" },
        "beforeTokens": { "type": "number" },
        "afterTokens": { "type": "number" },
        "messagesBefore": { "type": "number" },
        "messagesAfter": { "type": "number" },
        "aggregatedCount": { "type": "number" }
      }
    },

    "Pin": {
      "type": "object",
      "properties": {
        "time": { "type": "number" },
        "chat": { "type": "string" },
        "role": { "type": "string" },
        "index": { "type": "number" },
        "content": { "type": "string" }
      }
    },

    "Stats": {
      "type": "object",
      "properties": {
        "messagesCount": { "type": "number" },
        "pinsCount": { "type": "number" },
        "currentChat": { "type": "string" },
        "model": { "type": "string" }
      }
    },

    "VersionInfo": {
      "type": "object",
      "properties": {
        "current": { "type": "string" },
        "latest": { "type": "string" },
        "available": { "type": "boolean" },
        "error": { "type": "string" }
      }
    },

    "HealthStatus": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "enum": ["ok", "degraded", "error"] },
        "version": { "type": "string" },
        "uptime": { "type": "number" },
        "configLoaded": { "type": "boolean" },
        "apiConfigured": { "type": "boolean" },
        "mcpServers": { "type": "number" },
        "plugins": { "type": "number" }
      }
    },

    "ToolStep": {
      "type": "object",
      "properties": {
        "tool": { "type": "string", "description": "Tool name" },
        "args": { "type": "object", "description": "Tool arguments" }
      },
      "required": ["tool"]
    },

    "AuthRequest": {
      "type": "object",
      "properties": {
        "code": { "type": "string" },
        "auth_url": { "type": "string" },
        "poll_id": { "type": "string" },
        "expires_at": { "type": "number" }
      }
    }
  }
}
