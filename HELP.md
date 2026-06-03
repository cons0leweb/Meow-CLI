# HELP.md — Meow CLI v3.0 · Полный справочник / Full Reference / 完整参考

---

# 🇷🇺 Русский

## 🚀 Быстрый старт

```bash
node index.js              # Запуск
/key sk-your-key           # API-ключ OpenAI / OpenRouter
/model gpt-4o              # Выбор модели
/theme                     # Выбор темы оформления
/lang ru                   # Русский язык интерфейса
```

## 💬 Чат и сессии

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/chat list` | Список всех чатов | — |
| `/chat new [имя]` | Создать новый чат | `имя` — произвольное название |
| `/chat use <имя>` | Переключиться на чат | `имя` — существующий чат |
| `/chat delete <имя>` | Удалить чат | `имя` — чат для удаления |
| `/clear` | Сбросить контекст текущего чата | — |
| `/pins` | Показать закреплённые сообщения | — |
| `/pin [N]` | Закрепить сообщение | `N` — номер сообщения (по умолч. последнее) |
| `/vacuum on\|off` | Автоочистка истории | `on\|off` — вкл/выкл |
| `/vacuum drop:N keep:N` | Настройка автоочистки | `drop` — сколько удалять, `keep` — сколько оставлять с конца |
| `/compact` | Сжать историю (экономия токенов) | — |
| `/compact --ai` | AI-сжатие истории | — |

## 🤖 Автопилот и агенты

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/autopilot <задача>` | Автономное выполнение задачи | `задача` — описание (алиас: `/ap`) |
| `/ap-config` | Показать настройки автопилота | — |
| `/ap-limit <N>` | Максимум итераций | `N` — число (по умолч. 50) |
| `/ap-errors <N>` | Максимум ошибок | `N` — число (по умолч. 5) |
| `/ap-trigger <cmd>` | Команда после завершения | `cmd` — любая команда CLI |
| `/lead [опции] [контекст]` | Режим Lead Developer | `--auto` — авто-выполнение |
| | | `--plan` — только планирование |
| | | `--focus <область>` — фокус на части проекта |
| | | `--tasks N` — макс. задач (по умолч. 5) |
| `/delegate <задача>` | Параллельные под-агенты | `задача` — описание |

## 🧠 Память и интеллект

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/memory stats` | Статистика изученного | — |
| `/memory search <q>` | Поиск в памяти | `q` — запрос |
| `/memory prefs` | Изученные предпочтения | — |
| `/memory clear` | Очистить память проекта | — |
| `/routing on\|off` | Умная маршрутизация моделей | `on\|off` |
| `/routing fast <model>` | Модель для простых запросов | `model` — ID модели |
| `/routing powerful <model>` | Модель для сложных запросов | `model` — ID модели |
| `/optimize` | Настройка оптимизатора промптов | `on\|off` — вкл/выкл |
| `/optimize model <m>` | Модель для оптимизации | `m` — ID модели |
| `/init` | Индексация проекта AI | — |
| `/init --force` | Переиндексация | — |

## 🔧 Инструменты

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/list <путь>` | Содержимое папки | `путь` — относительный или абсолютный |
| `/read <файл>` | Прочитать файл | `файл` — путь к файлу |
| `/shell <cmd>` | Выполнить команду | `cmd` — shell-команда |
| `/find <паттерн>` | Поиск в проекте | `паттерн` — regex или текст |
| `/rewind [N]` | Откат изменений | `N` — число шагов назад |
| `/rewind --list` | Список чекпоинтов | — |
| `/img <путь\|url> [текст]` | Анализ изображения | `путь` — файл, `url` — ссылка, `текст` — вопрос |
| `{img:файл} текст` | Встроенное изображение | — |

## 🔒 Безопасность

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/permissions` | Управление правами инструментов | — |
| `/perm allow <tool>` | Разрешить инструмент | `tool` — название инструмента |
| `/perm deny <tool>` | Запретить инструмент | `tool` — название инструмента |
| `/audit` | Лог аудита безопасности | — |
| `/incognito on\|off` | Режим инкогнито | `on\|off` |
| `/trust` | Статус доверия репозитория | — |
| `/trust grant` | Довериться репозиторию | — |

## ⚙️ Настройки

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/key [sk-...]` | Установить API-ключ | `sk-...` — ключ |
| `/url [url]` | Базовый URL API | `url` — адрес |
| `/model [name]` | Выбор модели | `name` — ID модели |
| `/profile [name]` | Профиль (роль) | `name` — default/creative/кастомный |
| `/temp [0.0-2.0]` | Температура модели | `0.0-2.0` |
| `/theme [name]` | Тема оформления | `name` — название темы |
| `/lang ru\|en\|zh` | Язык интерфейса | `ru` `en` `zh` |
| `/provider` | Управление провайдерами API | — |
| `/provider add <name> <url> <key>` | Добавить провайдера | `name` `url` `key` |
| `/provider use <name>` | Переключить провайдера | `name` |
| `/alias` | Показать алиасы команд | — |
| `/alias add <a> <b>` | Добавить алиас | `a` → `b` |
| `/saveconfig` | Сохранить конфигурацию | — |
| `/config` | Показать конфиг (JSON) | — |
| `/stats` | Статус сессии | — |

## 🧩 Расширения

| Команда | Описание | Параметры |
|:--------|:---------|:----------|
| `/plugin list` | Список плагинов | — |
| `/plugin install <name>` | Установить плагин | `name` — имя |
| `/plugin remove <name>` | Удалить плагин | `name` |
| `/mcp` | MCP-серверы | — |
| `/mcp add <name> <cmd>` | Добавить MCP-сервер | `name` `cmd` |
| `/mcp remove <name>` | Удалить MCP-сервер | `name` |
| `/session save [name]` | Сохранить сессию | `name` — метка |
| `/session load <id>` | Загрузить сессию | `id` |
| `/session list` | Список сессий | — |
| `/cost` | Затраты токенов | — |
| `/cost total` | Общие затраты | — |
| `/version` | Версия и обновления | — |
| `/update` | Проверить обновления | — |
| `/preview start\|stop` | Dev-сервер | `start\|stop` |
| `/help [тема]` | Справка | `тема` — chat/autopilot/security/settings/extras |

## 📋 Горячие клавиши

| Клавиша | Действие |
|:--------|:---------|
| `Tab` | Автодополнение команд |
| `Ctrl+C` (1 раз) | Остановить автопилот |
| `Ctrl+C` (2 раза) | Выход |
| `↑/↓` | История команд |

---

# 🇬🇧 English

## 🚀 Quick Start

```bash
node index.js              # Launch
/key sk-your-key           # Set API key (OpenAI / OpenRouter)
/model gpt-4o              # Choose model
/theme                     # Pick color theme
/lang en                   # English UI
```

## 💬 Chat & Sessions

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/chat list` | List all chats | — |
| `/chat new [name]` | Create new chat | `name` — arbitrary label |
| `/chat use <name>` | Switch to chat | `name` — existing chat |
| `/chat delete <name>` | Delete a chat | `name` |
| `/clear` | Reset current chat context | — |
| `/pins` | Show pinned messages | — |
| `/pin [N]` | Pin a message | `N` — message number (default: last) |
| `/vacuum on\|off` | Auto-clean history | `on\|off` |
| `/vacuum drop:N keep:N` | Configure vacuum | `drop` — remove N old, `keep` — keep N newest |
| `/compact` | Compact history (save tokens) | — |
| `/compact --ai` | AI-powered compaction | — |

## 🤖 Autopilot & Agents

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/autopilot <task>` | Autonomous task execution | `task` — description (alias: `/ap`) |
| `/ap-config` | Show autopilot settings | — |
| `/ap-limit <N>` | Max iterations | `N` — number (default: 50) |
| `/ap-errors <N>` | Max errors allowed | `N` — number (default: 5) |
| `/ap-trigger <cmd>` | Post-completion command | `cmd` — any CLI command |
| `/lead [opts] [context]` | Lead Developer mode | `--auto` — auto-execute |
| | | `--plan` — planning only |
| | | `--focus <area>` — focus on specific part |
| | | `--tasks N` — max tasks (default: 5) |
| `/delegate <task>` | Parallel sub-agents | `task` — description |

## 🧠 Memory & Intelligence

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/memory stats` | Learned statistics | — |
| `/memory search <q>` | Search memory | `q` — query |
| `/memory prefs` | Learned preferences | — |
| `/memory clear` | Wipe project memory | — |
| `/routing on\|off` | Smart model routing | `on\|off` |
| `/routing fast <model>` | Model for simple queries | `model` — model ID |
| `/routing powerful <model>` | Model for complex queries | `model` — model ID |
| `/optimize` | Prompt optimizer config | `on\|off` — enable/disable |
| `/optimize model <m>` | Optimizer model | `m` — model ID |
| `/init` | AI project indexing | — |
| `/init --force` | Re-index project | — |

## 🔧 Tools

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/list <path>` | Browse directory | `path` — relative or absolute |
| `/read <file>` | Read file | `file` — path |
| `/shell <cmd>` | Execute shell command | `cmd` — shell command |
| `/find <pattern>` | Search in project | `pattern` — regex or text |
| `/rewind [N]` | Undo changes | `N` — steps back |
| `/rewind --list` | List checkpoints | — |
| `/img <path\|url> [text]` | Analyze image | `path` — file, `url` — link, `text` — question |
| `{img:file} text` | Inline image syntax | — |

## 🔒 Security

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/permissions` | Manage tool permissions | — |
| `/perm allow <tool>` | Allow tool | `tool` — tool name |
| `/perm deny <tool>` | Deny tool | `tool` — tool name |
| `/audit` | Security audit log | — |
| `/incognito on\|off` | Incognito mode | `on\|off` |
| `/trust` | Repo trust status | — |
| `/trust grant` | Grant trust to repo | — |

## ⚙️ Settings

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/key [sk-...]` | Set API key | `sk-...` |
| `/url [url]` | Set base API URL | `url` |
| `/model [name]` | Choose model | `name` — model ID |
| `/profile [name]` | Switch profile | `name` — default/creative/custom |
| `/temp [0.0-2.0]` | Set temperature | `0.0-2.0` |
| `/theme [name]` | Color theme | `name` — theme name |
| `/lang ru\|en\|zh` | UI language | `ru` `en` `zh` |
| `/provider` | Manage API providers | — |
| `/provider add <name> <url> <key>` | Add provider | `name` `url` `key` |
| `/provider use <name>` | Switch provider | `name` |
| `/alias` | Show aliases | — |
| `/alias add <a> <b>` | Add alias | `a` → `b` |
| `/saveconfig` | Save config to file | — |
| `/config` | Show config (JSON) | — |
| `/stats` | Session status | — |

## 🧩 Extensions

| Command | Description | Parameters |
|:--------|:------------|:-----------|
| `/plugin list` | List plugins | — |
| `/plugin install <name>` | Install plugin | `name` |
| `/plugin remove <name>` | Remove plugin | `name` |
| `/mcp` | MCP servers | — |
| `/mcp add <name> <cmd>` | Add MCP server | `name` `cmd` |
| `/mcp remove <name>` | Remove MCP server | `name` |
| `/session save [name]` | Save session | `name` — label |
| `/session load <id>` | Load session | `id` |
| `/session list` | List sessions | — |
| `/cost` | Token usage | — |
| `/cost total` | Total cost | — |
| `/version` | Version & updates | — |
| `/update` | Check for updates | — |
| `/preview start\|stop` | Dev server | `start\|stop` |
| `/help [topic]` | Help | `topic` — chat/autopilot/security/settings/extras |

## 📋 Hotkeys

| Key | Action |
|:----|:-------|
| `Tab` | Autocomplete commands |
| `Ctrl+C` (×1) | Stop autopilot |
| `Ctrl+C` (×2) | Exit CLI |
| `↑/↓` | Command history |

---

# 🇨🇳 中文

## 🚀 快速开始

```bash
node index.js              # 启动
/key sk-your-key           # 设置 API 密钥 (OpenAI / OpenRouter)
/model gpt-4o              # 选择模型
/theme                     # 选择主题
/lang zh                   # 中文界面 (即将推出)
```

## 💬 聊天与会话

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/chat list` | 列出所有聊天 | — |
| `/chat new [名称]` | 新建聊天 | `名称` — 任意标签 |
| `/chat use <名称>` | 切换到聊天 | `名称` — 已有聊天 |
| `/chat delete <名称>` | 删除聊天 | `名称` |
| `/clear` | 清除当前上下文 | — |
| `/pins` | 查看固定消息 | — |
| `/pin [N]` | 固定消息 | `N` — 消息编号 (默认: 最后一条) |
| `/vacuum on\|off` | 自动清理历史 | `on\|off` |
| `/vacuum drop:N keep:N` | 配置清理规则 | `drop` — 删除旧消息数, `keep` — 保留最新消息数 |
| `/compact` | 压缩历史 (节省 token) | — |
| `/compact --ai` | AI 压缩 | — |

## 🤖 自动驾驶与智能体

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/autopilot <任务>` | 自动执行任务 | `任务` — 描述 (别名: `/ap`) |
| `/ap-config` | 显示自动驾驶设置 | — |
| `/ap-limit <N>` | 最大迭代次数 | `N` — 数字 (默认: 50) |
| `/ap-errors <N>` | 最大错误数 | `N` — 数字 (默认: 5) |
| `/ap-trigger <cmd>` | 完成后执行的命令 | `cmd` — CLI 命令 |
| `/lead [选项] [上下文]` | 首席开发者模式 | `--auto` — 自动执行 |
| | | `--plan` — 仅规划 |
| | | `--focus <领域>` — 聚焦特定部分 |
| | | `--tasks N` — 最大任务数 (默认: 5) |
| `/delegate <任务>` | 并行子智能体 | `任务` — 描述 |

## 🧠 记忆与智能

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/memory stats` | 学习统计 | — |
| `/memory search <q>` | 搜索记忆 | `q` — 查询 |
| `/memory prefs` | 学习到的偏好 | — |
| `/memory clear` | 清除项目记忆 | — |
| `/routing on\|off` | 智能模型路由 | `on\|off` |
| `/routing fast <model>` | 简单查询的模型 | `model` — 模型 ID |
| `/routing powerful <model>` | 复杂查询的模型 | `model` — 模型 ID |
| `/optimize` | 提示优化器设置 | `on\|off` — 启用/禁用 |
| `/optimize model <m>` | 优化器模型 | `m` — 模型 ID |
| `/init` | AI 项目索引 | — |
| `/init --force` | 重新索引 | — |

## 🔧 工具

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/list <路径>` | 浏览目录 | `路径` — 相对或绝对路径 |
| `/read <文件>` | 读取文件 | `文件` — 路径 |
| `/shell <cmd>` | 执行 Shell 命令 | `cmd` — Shell 命令 |
| `/find <模式>` | 搜索项目 | `模式` — 正则或文本 |
| `/rewind [N]` | 撤销更改 | `N` — 回退步数 |
| `/rewind --list` | 检查点列表 | — |
| `/img <路径\|url> [文本]` | 分析图像 | `路径` — 文件, `url` — 链接, `文本` — 问题 |
| `{img:文件} 文本` | 内联图像语法 | — |

## 🔒 安全

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/permissions` | 管理工具权限 | — |
| `/perm allow <tool>` | 允许工具 | `tool` — 工具名称 |
| `/perm deny <tool>` | 拒绝工具 | `tool` — 工具名称 |
| `/audit` | 安全审计日志 | — |
| `/incognito on\|off` | 隐身模式 | `on\|off` |
| `/trust` | 仓库信任状态 | — |
| `/trust grant` | 信任当前仓库 | — |

## ⚙️ 设置

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/key [sk-...]` | 设置 API 密钥 | `sk-...` |
| `/url [url]` | 设置 API 基础 URL | `url` |
| `/model [名称]` | 选择模型 | `名称` — 模型 ID |
| `/profile [名称]` | 切换角色 | `名称` — default/creative/自定义 |
| `/temp [0.0-2.0]` | 设置温度 | `0.0-2.0` |
| `/theme [名称]` | 颜色主题 | `名称` — 主题名称 |
| `/lang ru\|en\|zh` | 界面语言 | `ru` `en` `zh` |
| `/provider` | 管理 API 提供商 | — |
| `/provider add <名称> <url> <key>` | 添加提供商 | `名称` `url` `key` |
| `/provider use <名称>` | 切换提供商 | `名称` |
| `/alias` | 显示别名 | — |
| `/alias add <a> <b>` | 添加别名 | `a` → `b` |
| `/saveconfig` | 保存配置 | — |
| `/config` | 显示配置 (JSON) | — |
| `/stats` | 会话状态 | — |

## 🧩 扩展

| 命令 | 说明 | 参数 |
|:-----|:-----|:-----|
| `/plugin list` | 插件列表 | — |
| `/plugin install <名称>` | 安装插件 | `名称` |
| `/plugin remove <名称>` | 删除插件 | `名称` |
| `/mcp` | MCP 服务器 | — |
| `/mcp add <名称> <cmd>` | 添加 MCP 服务器 | `名称` `cmd` |
| `/mcp remove <名称>` | 删除 MCP 服务器 | `名称` |
| `/session save [名称]` | 保存会话 | `名称` — 标签 |
| `/session load <id>` | 加载会话 | `id` |
| `/session list` | 会话列表 | — |
| `/cost` | Token 用量 | — |
| `/cost total` | 总费用 | — |
| `/version` | 版本与更新 | — |
| `/update` | 检查更新 | — |
| `/preview start\|stop` | 开发服务器 | `start\|stop` |
| `/help [主题]` | 帮助 | `主题` — chat/autopilot/security/settings/extras |

## 📋 快捷键

| 按键 | 操作 |
|:-----|:-----|
| `Tab` | 命令自动补全 |
| `Ctrl+C` (×1) | 停止自动驾驶 |
| `Ctrl+C` (×2) | 退出 CLI |
| `↑/↓` | 命令历史 |

---

<p align="center">
  <sub>🐾 Meow CLI v3.0 · Built for developers who live in the terminal.</sub>
</p>
