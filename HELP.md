## 1. Оглавление / Table of Contents / 目录

- [1. Оглавление](#1-оглавление)
- [2. Быстрый старт (Quick Start)](#2-быстрый-старт-quick-start)
- [3. Установка и обновление / Installation / 安装更新](#3-установка-и-обновление--installation--安装更新)
- [4. Конфигурация: общая / General Config / 通用配置](#4-конфигурация-общая--general-config--通用配置)
  - [4.1 Файл `~/.meowcli/data/config.json` и шифрование](#41-файл-meowclidataconfigjson-и-шифрование)
  - [4.2 Параметры верхнего уровня](#42-параметры-верхнего-уровня)
- [5. Провайдеры и модели / Providers & Models / 提供商与模型](#5-провайдеры-и-модели--providers--models--提供商与模型)
  - [5.1 `/provider` – управление провайдерами](#51-provider--управление-провайдерами)
  - [5.2 `/model` – выбор модели](#52-model--выбор-модели)
  - [5.3 API Schema (OpenAI / Claude / Gemini)](#53-api-schema-openai--claude--gemini)
  - [5.4 Custom Values (headers, query, body)](#54-custom-values-headers-query-body)
- [6. Ассистенты и профили / Assistants & Profiles / 助手与配置文件](#6-ассистенты-и-профили--assistants--profiles--助手与配置文件)
  - [6.1 Профили (`/profile`)](#61-профили-profile)
  - [6.2 Ассистенты (`/assistant`)](#62-ассистенты-assistant)
- [7. Чат и история / Chat & History / 聊天与历史](#7-чат-и-история--chat--history--聊天与历史)
  - [7.1 Управление чатами `/chat`](#71-управление-чатами-chat)
  - [7.2 Контекст `/context` и MEOW.md](#72-контекст-context-и-meowmd)
  - [7.3 Сжатие `/compact`](#73-сжатие-compact)
  - [7.4 Откат `/rewind`](#74-откат-rewind)
- [8. Автопилот и агенты / Autopilot & Agents / 自动驾驶与智能体](#8-автопилот-и-агенты--autopilot--agents--自动驾驶与智能体)
  - [8.1 `/autopilot` / `/ap`](#81-autopilot--ap)
  - [8.2 `/ap-config`, `/ap-limit`, `/ap-errors`, `/trigger`](#82-ap-config-ap-limit-ap-errors-trigger)
  - [8.3 `/lead` – Lead Developer (автономный)](#83-lead--lead-developer-автономный)
  - [8.4 `/delegate` – делегирование под‑агенту](#84-delegate--делегирование-под-агенту)
  - [8.5 `/pair` – парное программирование](#85-pair--парное-программирование)
  - [8.6 Subagent (глубина, кэш, бюджет)](#86-subagent-глубина-кэш-бюджет)
- [9. Инструменты и файловая система / Tools & Filesystem / 工具与文件系统](#9-инструменты-и-файловая-система--tools--filesystem--工具与文件系统)
  - [9.1 Чтение / запись / патч](#91-чтение--запись--патч)
  - [9.2 Поиск (`/list`, `/read`, `/shell`, `/find`, `/grep_search`)](#92-поиск-list-read-shell-find-grep_search)
  - [9.3 Разрешения (`/permissions`, `/perm`)](#93-разрешения-permissions-perm)
  - [9.4 Git и CI/CD](#94-git-и-cicd)
  - [9.5 Linux‑системные инструменты](#95-linux-системные-инструменты)
- [10. Безопасность / Security / 安全](#10-безопасность--security--安全)
  - [10.1 Sandbox (ограничение доступа)](#101-sandbox-ограничение-доступа)
  - [10.2 Шифрование конфигурации (`config.json.mc`)](#102-шифрование-конфигурации-configjsonmc)
  - [10.3 Инкогнито `/incognito`](#103-инкогнито-incognito)
  - [10.4 Аудит `/audit`](#104-аудит-audit)
  - [10.5 Доверие `/trust`](#105-доверие-trust)
- [11. Память и умная маршрутизация / Memory & Smart Routing / 记忆与智能路由](#11-память-и-умная-маршрутизация--memory--smart-routing--记忆与智能路由)
  - [11.1 RAG `/memory`](#111-rag-memory)
  - [11.2 `/routing` – выбор модели по сложности](#112-routing--выбор-модели-по-сложности)
  - [11.3 Prompt Optimizer `/optimize`](#113-prompt-optimizer-optimize)
- [12. Плагины и MCP / Plugins & MCP / 插件与 MCP](#12-плагины-и-mcp--plugins--mcp--插件与-mcp)
  - [12.1 Плагины `/plugin`](#121-плагины-plugin)
  - [12.2 MCP (Model Context Protocol) `/mcp`](#122-mcp-model-context-protocol-mcp)
- [13. Темы и внешний вид / Themes & UI / 主题与界面](#13-темы-и-внешний-вид--themes--ui--主题与界面)
  - [13.1 `/theme`](#131-theme)
  - [13.2 Настройка `themes.json`](#132-настройка-themesjson)
- [14. Экспорт / импорт / сессии](#14-экспорт--импорт--сессии)
  - [14.1 `/session`](#141-session)
  - [14.2 `/export` и `/import`](#142-export-и-import)
- [15. Подсказки / Suggestions & Alias](#15-подсказки--suggestions--alias)
  - [15.1 `suggestCommand` (did you mean)](#151-suggestcommand-did-you-mean)
  - [15.2 `/alias` (сокращения)](#152-alias-сокращения)
- [16. Команды быстрого доступа (шпаргалка)](#16-команды-быстрого-доступа-шпаргалка)

---

## 2. Быстрый старт (Quick Start)

### Русский

```bash
# Установка (из репозитория)
curl -fsSL https://github.com/cons0leweb/Meow-CLI/releases/latest/download/meow-cli.tar.xz | tar -xJ
sudo mv meow /usr/local/bin/

# Первый запуск
meow
# -> автоматически создаст ~/.meowcli/data/
# -> предложит включить шифрование конфигурации

# Настройка API (OpenAI / DeepSeek / любой OpenAI‑совместимый)
/key sk-ваш_ключ
/url https://api.openai.com/v1
/model gpt-4-turbo

# Простой чат
Привет, как дела?

# Автопилот
/ap Создай REST API на Express с GET /users
```

### English

```bash
# Install
curl -fsSL https://github.com/cons0leweb/Meow-CLI/releases/latest/download/meow-cli.tar.xz | tar -xJ
sudo mv meow /usr/local/bin/

# First run
meow
# -> creates ~/.meowcli/data/
# -> asks for encryption

# Setup API (OpenAI / DeepSeek / any OpenAI-compatible)
/key sk-your_key
/url https://api.openai.com/v1
/model gpt-4-turbo

# Simple chat
Hello, how are you?

# Autopilot
/ap Create a REST API with Express and GET /users
```

### 中文

```bash
# 安装
curl -fsSL https://github.com/cons0leweb/Meow-CLI/releases/latest/download/meow-cli.tar.xz | tar -xJ
sudo mv meow /usr/local/bin/

# 首次运行
meow
# -> 创建 ~/.meowcli/data/
# -> 询问是否加密配置

# 配置 API（OpenAI / DeepSeek / 任何 OpenAI 兼容端点）
/key sk-你的密钥
/url https://api.openai.com/v1
/model gpt-4-turbo

# 简单对话
你好，最近怎么样？

# 自动驾驶模式
/ap 使用 Express 创建一个 REST API，包含 GET /users
```

---

## 3. Установка и обновление / Installation / 安装更新

| Команда | Русский | English | 中文 |
|---------|---------|---------|------|
| `/version` | Показать текущую версию и проверить обновления | Show current version & check for updates | 显示当前版本并检查更新 |
| `/update` | Показать инструкцию по обновлению до последней версии | Show upgrade instructions | 显示升级到最新版的说明 |

**Пример / Example / 例子:**

```
meow
> /version
  🐾 Meow CLI  v3.0.0
  ──────────────────────────────
  ✅ You're on the latest version (v3.0.0)
```

---

## 4. Конфигурация: общая / General Config / 通用配置

### 4.1 Файл `~/.meowcli/data/config.json` и шифрование

- **Путь:** `~/.meowcli/data/config.json` (или `config.json.mc` если включено шифрование)
- **Шифрование:** включается при первом запуске. Ключ хранится в `~/.meowcli/data/.data` (только локально).
- **Мастер‑пароль:** не требуется — используется автоматически сгенерированный seed.

Если шифрование **выключено**, файл остаётся в открытом виде.  
Если **включено**, то:
- исходный `config.json` переименовывается в `config.json.delete` и удаляется при следующем запуске
- вместо него создаётся `config.json.mc` с AES‑256‑GCM шифрованием.

**Параметры верхнего уровня** (пример):

```json
{
  "api_base": "https://api.openai.com/v1",
  "api_key": "sk-...",
  "model": "gpt-4-turbo",
  "auto_yes": false,
  "quiet": false,
  "profile": "default",
  "theme": "default",
  "lang": "ru",
  "git": { ... },
  "autopilot": { ... },
  "prompt_optimizer": { ... },
  "vacuum": { ... },
  "profiles": { ... },
  "aliases": { ... },
  "providers": { ... },
  "active_provider": "",
  "api_schema": "openai",
  "smart_routing": { ... },
  "mcp_servers": { ... }
}
```

### 4.2 Параметры верхнего уровня

| Параметр | Тип | Описание |
|----------|-----|-----------|
| `api_base` | string | Базовый URL API (например `https://api.openai.com/v1`) |
| `api_key` | string | API‑ключ (будет зашифрован) |
| `model` | string | Модель по умолчанию (например `gpt-4-turbo`, `deepseek-chat`) |
| `auto_yes` | bool | Автоматически подтверждать опасные операции (по умолч. `false`) |
| `profile` | string | Активный профиль (см. раздел 6) |
| `theme` | string | Имя темы оформления (`default`, `dark`, `light`, свои) |
| `lang` | string | Язык интерфейса (`ru` / `en`) |
| `active_provider` | string | ID активного провайдера (см. раздел 5) |
| `api_schema` | `openai` / `claude` / `gemini` | Формат API (по умолч. `openai`) |
| `smart_routing.enabled` | bool | Включить умную маршрутизацию моделей |
| `vacuum.enabled` | bool | Авто‑очистка старых сообщений |

---

## 5. Провайдеры и модели / Providers & Models / 提供商与模型

### 5.1 `/provider` – управление провайдерами

```bash
/provider                # интерактивное меню
```

- **Просмотр списка** – выбираете провайдера, видите его `base_url`, `api_key`, `model`, `api_schema`.
- **Добавление нового** – указываете имя (`deepseek`, `openrouter`), URL, ключ, модель, схему (OpenAI/Claude/Gemini).
- **Переключение** – делает активным выбранного провайдера и меняет глобальные `api_base`, `api_key`, `model`, `api_schema`.
- **Удаление** – удаляет провайдера из конфига.

**Пример добавления DeepSeek:**

```
/provider
→ Add New Provider
→ Name: deepseek
→ Base URL: https://api.deepseek.com/v1
→ API Key: sk-...
→ Default Model: deepseek-chat
→ API Schema: openai
→ Switch to this provider now? Yes
```

### 5.2 `/model` – выбор модели

```bash
/model gpt-4o-mini
/model                    # показать текущую модель
```

### 5.3 API Schema (OpenAI / Claude / Gemini)

Задаётся либо в `active_provider.api_schema`, либо глобально `api_schema`.  
Влияет на:
- формат запроса (`/chat/completions` или `/v1/messages` или `:generateContent`)
- формат системного промпта
- формат инструментов (tool calls)

**Claude** требует обязательного поля `max_tokens` (CLI выставляет 4096).  
**Gemini** использует `contents` и `system_instruction`.

### 5.4 Custom Values (headers, query, body)

**Интерактивная настройка:**  
`/provider` → выбрать провайдера → `Configure Custom Values`

**Прямое редактирование JSON:**

```json
"custom_values": {
  "headers": { "X-API-Version": "2024-01" },
  "query_params": { "retry": "3" },
  "body_params": { "temperature": 0.7 }
}
```

Эти значения **добавляются** в каждый запрос к API (сливаются с основными параметрами).  
Типы преобразуются автоматически: `"true"` → `true`, `"123"` → `123`, `{"a":1}` → объект.

---

## 6. Ассистенты и профили / Assistants & Profiles / 助手与配置文件

### 6.1 Профили (`/profile`)

```bash
/profile                # показать текущий профиль и список
/profile creative       # переключиться на профиль "creative"
```

Профиль – это именованный набор:
- `system` – системный промпт (инструкция для ИИ)
- `temperature` – температура (0.0 … 2.0)

**Пример профиля в `config.json`:**

```json
"profiles": {
  "default": {
    "temperature": 0.2,
    "system": "Ты — опытный инженер-программист. Будь краток."
  },
  "creative": {
    "temperature": 0.8,
    "system": "Ты — креативный помощник. Предлагай нестандартные идеи."
  }
}
```

### 6.2 Ассистенты (`/assistant`)

```bash
/assistant list                       # список кастомных ассистентов
/assistant new "senior-dev" "Ты — senior разработчик..." temp:0.1
/assistant use senior-dev             # переключиться
/assistant show senior-dev            # показать промпт
```

Ассистенты хранятся как отдельные файлы в `~/.meowcli/data/assistants/*.json`.  
Они автоматически добавляются в `profiles`.  
Если ассистент активен (`/assistant use`), его системный промпт заменяет текущий.

---

## 7. Чат и история / Chat & History / 聊天与历史

### 7.1 Управление чатами `/chat`

```bash
/chat list                      # список всех чатов
/chat new myproject             # создать новый чат
/chat use myproject             # переключиться
/chat delete myproject          # удалить чат
/clear                          # очистить текущий контекст, оставив чат
/reset                          # полный сброс текущего чата
```

### 7.2 Контекст `/context` и MEOW.md

CLI автоматически загружает контекст из:
- `~/.meowcli/MEOW.md` (глобальный)
- `./MEOW.md` (проектный)
- `./project.meow` (индекс, генерируется `/init`)

**Команды:**

```bash
/context show          # показать загруженный контекст
/context edit          # открыть ./MEOW.md в редакторе ($EDITOR)
/context reload        # перезагрузить контекст в системный промпт
```

**Директива `!include`**  
Внутри MEOW.md можно подключать другие файлы:

```markdown
!include docs/architecture.md
!include ../global-rules.md
```

Максимальная глубина – 3, циклические включения блокируются.

### 7.3 Сжатие `/compact`

```bash
/compact                     # сжать контекст (эвристически)
/compact --ai                # сжать с помощью AI (лучшее качество, но тратит токены)
/compact --keep=6            # оставить последние 6 сообщений нетронутыми
```

Авто‑сжатие: когда `estimateTokens(messages) > 80000`, CLI сам запускает `/compact --ai`.

### 7.4 Откат `/rewind`

Работает на основе **чекпойнтов** (снимков файлов перед изменениями).

```bash
/rewind --list               # показать все чекпойнты
/rewind                      # откатить последнее изменение
/rewind 3                    # откатить на 3 шага назад
/checkpoint                  # алиас для /rewind --list
```

Чекпойнты автоматически создаются перед `write_file`, `patch_file`, `move_file`, `delete_file`.

---

## 8. Автопилот и агенты / Autopilot & Agents / 自动驾驶与智能体

### 8.1 `/autopilot` / `/ap`

```bash
/ap "Добавить JWT аутентификацию в Express"
/autopilot "Рефакторинг модуля авторизации"
```

Автопилот самостоятельно:
1. Анализирует код (читает файлы, ищет паттерны)
2. Составляет план
3. Выполняет изменения (через `patch_file`, `write_file`)
4. Запускает тесты / линтеры для проверки
5. При необходимости исправляет ошибки

**Этапы** (видны в выводе):  
`📋 PLAN:` → `⚡ STEP N:` → `🔍 VERIFY:` → `✅ AUTOPILOT COMPLETE`

### 8.2 `/ap-config`, `/ap-limit`, `/ap-errors`, `/trigger`

```bash
/ap-config                     # показать текущие настройки
/ap-limit 30                   # максимум итераций (по умолч. 50)
/ap-errors 3                   # максимум ошибок до остановки
/trigger "notify-send 'Done'"  # команда, выполняемая после успешного завершения
/trigger off                   # отключить триггер
```

**Пример `trigger`** – может быть любой shell‑командой, например `osascript -e 'display notification "Готово"'` на macOS.

### 8.3 `/lead` – Lead Developer (автономный)

```bash
/lead "Подготовить проект к продакшену"
/lead auto --focus security --tasks 5
/lead --plan                      # только спланировать задачи, не выполнять
/lead --focus "performance"       # сосредоточиться на производительности
```

**Что делает `lead`?**
- Анализирует проект (тип: node/rust/go/python, наличие тестов, линтеров)
- Смотрит Git‑историю, горячие файлы
- Сканирует TODO / FIXME, сложные участки кода
- Предлагает Roadmap (категории: `fix_bugs`, `add_tests`, `refactor`, `security`, `performance`…)
- Выполняет задачи последовательно или параллельно (через под‑агентов)
- После каждой задачи прогоняет качественные врата (`npm test`, `cargo check` и т.д.)
- Учитcя на ошибках (RAG память)

### 8.4 `/delegate` – делегирование под‑агенту

```bash
/delegate "Найти все файлы, где используется axios, и заменить на fetch"
```

Под‑агент работает в изолированной среде со своим бюджетом токенов.  
Результат возвращается асинхронно.  
Можно делегировать **несколько задач параллельно** через инструмент `delegate_task` (используется AI).

### 8.5 `/pair` – парное программирование

```bash
/pair verbose         # очень подробно, объясняет каждый шаг
/pair balanced        # умеренно (по умолчанию)
/pair silent          # минимум комментариев
/pair off             # отключить режим
```

Влияет на системный промпт, добавляется суффикс с инструкцией.

### 8.6 Subagent (глубина, кэш, бюджет)

Параметры (передаются AI через `delegate_task`):

```json
{
  "tasks": [
    {
      "description": "Переписать тесты на vitest",
      "tools": ["read_file", "write_file", "run_shell"],
      "max_tokens": 50000,
      "max_cost": 1.0
    }
  ]
}
```

- **Глубина** (`depth`) – ограничивает вложенные вызовы (по умолч. 3)
- **Кэш** – результаты под‑агентов кэшируются на 5 минут (TTL)
- **Бюджет** – токены и стоимость, при превышении под‑агент останавливается

---

## 9. Инструменты и файловая система / Tools & Filesystem / 工具与文件系统

### 9.1 Чтение / запись / патч

```bash
/read src/index.js                  # прочитать файл
/read src/index.js start_line=10 end_line=20
/list                               # показать текущую директорию
/list src/components --recursive
/shell "npm run build"              # выполнить команду
/undo                               # отменить последнюю операцию записи
/undo 2                             # отменить последние 2 изменения
```

**Важно:** `patch_file` предпочтительнее `write_file` для точечных правок.  
Он проверяет уникальность `old_string` и показывает diff перед применением.

### 9.2 Поиск (`/list`, `/read`, `/shell`, `/find`, `/grep_search`)

```bash
/find "auth"                        # ищет файлы по имени (использует индекс)
/find "*.ts"                        # поддерживает паттерны
/grep_search "TODO" --include="*.js"
```

**Индекс проекта** – создаётся `/index rebuild`.  
После этого `find_files` работает очень быстро (SQLite).  
Индекс обновляется автоматически (лениво) при изменении файлов.

### 9.3 Разрешения (`/permissions`, `/perm`)

Каждый инструмент может иметь уровень доступа:
- `allow` – всегда разрешён
- `deny` – всегда запрещён
- `ask` – спрашивать каждый раз (по умолчанию для опасных)

```bash
/permissions list
/perm allow write_file
/perm deny run_shell
/perm ask write_file                # убрать правило, вернуть к "ask"
/perm reset
```

**Безопасные инструменты** (никогда не спрашивают): `list_dir`, `read_file`, `grep_search`, `ask_user`, `confirm`, `choose`, `git_status`, `git_log`, `git_diff`.

**Опасные** (спрашиваются или блокируются): `run_shell`, `write_file`, `patch_file`, `http_request`, `web_search`, `git_commit`, `git_branch`, `ci_pipeline`, `delegate_task`, `linux_*`.

### 9.4 Git и CI/CD

```bash
/git on                             # включить авто‑коммиты после изменений
/git prefix "feat"                  # префикс для сообщений коммитов
/git ai on                          # генерировать сообщения коммитов через AI
/ci status                          # показать GitHub Actions / GitLab CI
/ci generate "Deploy to production" # создать workflow
/ci heal                            # попытаться автоматически починить упавшие тесты
```

**Git commit message** – AI анализирует staged diff и создаёт осмысленное сообщение.

### 9.5 Linux‑системные инструменты

Доступны только на Linux (и частично на macOS через совместимость):

```bash
/shell "linux_process_list"
/shell "linux_process_kill --pid 1234"
/shell "linux_service_control --service nginx --action restart"
/shell "linux_disk_usage"
/shell "linux_net_stat"
/shell "linux_pkg_manage --action install --package htop"
```

Все эти вызовы можно выполнять и через AI, который сам решит, когда их применить.

---

## 10. Безопасность / Security / 安全

### 10.1 Sandbox (ограничение доступа)

- По умолчанию доступны только файлы внутри `process.cwd()`, временная директория и явно разрешённые пути.
- Блокируются чувствительные паттерны: `.ssh`, `.env`, `id_rsa`, `/etc/passwd` и т.д.
- Опасные shell‑команды (например `rm -rf /`, `:(){ :|:& };:`) блокируются.
- Переменные окружения с ключами (`AWS_`, `API_KEY` и т.д.) фильтруются.

### 10.2 Шифрование конфигурации (`config.json.mc`)

При первом запуске CLI предлагает включить шифрование.  
Используется **AES‑256‑GCM** с PBKDF2 (180000 итераций).  
Ключ (seed) хранится в `~/.meowcli/data/.data`.  
Без этого файла расшифровать конфиг невозможно.

### 10.3 Инкогнито `/incognito`

```bash
/incognito on     # временная сессия – ничего не сохраняется на диск
/incognito off    # завершить, все временные данные удаляются
```

В режиме инкогнито:
- не пишется история чатов
- не создаются чекпойнты
- не сохраняются логи аудита

### 10.4 Аудит `/audit`

```bash
/audit show          # показать последние 30 событий
/audit clear         # очистить лог
```

Лог содержит: время, тип действия (tool_call, api_call, permission, file_change), детали.

### 10.5 Доверие `/trust`

```bash
/trust               # показать статус доверия к текущему репозиторию
/trust grant         # довериться репозиторию (разрешить запись)
```

Если репозиторий **не доверенный**, CLI работает в режиме **только чтение** (запрещены `write_file`, `patch_file`, `run_shell`, `git_commit`).  
Список доверенных / чёрный список загружается из `https://raw.githubusercontent.com/.../trust.meow`.

---

## 11. Память и умная маршрутизация / Memory & Smart Routing / 记忆与智能路由

### 11.1 RAG `/memory`

```bash
/memory stats                     # статистика памяти
/memory search "авторизация"      # поиск похожих записей
/memory add "Проект использует JWT с refresh токенами"
/memory prefs                     # показать выученные предпочтения
/memory clear                     # очистить память текущего проекта
```

CLI автоматически запоминает:
- **решения** (`recordDecision`)
- **исправления ошибок** (`recordErrorFix`)
- **паттерны кода** (`recordPattern`)
- **отклонённые предложения** (`recordRejection`)
- **предпочтения** (стиль кодирования, используемые инструменты)

Память привязана к проекту (определяется по `package.name` или имени директории).

### 11.2 `/routing` – выбор модели по сложности

```bash
/routing on
/routing fast gpt-4o-mini
/routing balanced gpt-4o
/routing powerful gpt-4-turbo
/routing status
```

- **Trivial / Simple** → `fast` (дешёвая модель)
- **Moderate** → `balanced`
- **Complex / Expert** → `powerful`

Анализирует длину сообщения, наличие кода, ключевые слова (`refactor`, `debug`, `security`).  
Экономит до 50‑70% стоимости при больших объёмах.

### 11.3 Prompt Optimizer `/optimize`

```bash
/optimize on
/optimize model gpt-4o-mini
/optimize verbose off
```

Оптимизатор переписывает промпт пользователя:
- укорачивает без потери смысла
- добавляет контекст проекта (из MEOW.md / package.json)
- исправляет грамматику

Полезно для улучшения качества ответов и экономии токенов.

---

## 12. Плагины и MCP / Plugins & MCP / 插件与 MCP

### 12.1 Плагины `/plugin`

```bash
/plugin list
/plugin enable my-tool
/plugin disable my-tool
/plugin reload
/plugin dir            # показать директорию для плагинов
```

Плагины – это JS / MJS / CJS файлы, экспортирующие:

```javascript
export default {
  name: "my-plugin",
  version: "1.0.0",
  commands: [
    {
      name: "mycmd",
      description: "My custom command",
      run: async (ctx, input, args) => {
        ctx.log.ok("Hello from plugin");
        return "result";
      }
    }
  ],
  onLoad: async (api) => { /* инициализация */ }
};
```

### 12.2 MCP (Model Context Protocol) `/mcp`

```bash
/mcp                          # интерактивное меню
/mcp add myserver --url https://example.com/sse
/mcp add local --command "npx -y @modelcontextprotocol/server-figma"
/mcp list
/mcp remove myserver
```

MCP расширяет набор инструментов AI.  
Все MCP‑инструменты становятся доступны под префиксом `mcp__сервер__инструмент`.  
Поддерживаются два типа подключения:
- **stdio** – локальная команда (`npx`, `python`)
- **sse** – удалённый SSE‑сервер

---

## 13. Темы и внешний вид / Themes & UI / 主题与界面

### 13.1 `/theme`

```bash
/theme               # показать список доступных тем
/theme dark          # переключиться на тему dark
/theme custom        # загрузить кастомную тему из themes.json
```

### 13.2 Настройка `themes.json`

Файл может лежать в:
- корне проекта (проектная тема)
- `~/.meowcli/data/themes.json` (пользовательская)

**Формат:**

```json
{
  "dark": {
    "name": "Dark Mode",
    "colors": {
      "accent": "#CC7832",
      "success": "#6ABE82",
      "error": "#D26060",
      "text": "#E8E8E8"
    }
  }
}
```

**Все доступные ключи цветов:**  
`accent`, `accent2`, `accent3`, `success`, `warning`, `error`, `info`, `muted`, `text`, `textDim`, `toolClr`, `userClr`, `aiClr`, `imgClr`, `autoClr`, `gradientStart`, `gradientMid`, `gradientEnd`.

---

## 14. Экспорт / импорт / сессии

### 14.1 `/session`

```bash
/session list                # список сохранённых сессий
/session load 3f8a2b1c       # загрузить сессию
/session save                # сохранить текущую сессию
/session delete 3f8a2b1c     # удалить
```

Сессия включает:
- модель, профиль, название чата
- полную историю сообщений (с обрезанными base64‑изображениями)
- рабочую директорию (cwd)

### 14.2 `/export` и `/import`

```bash
/export ./backup.json
/import ./backup.json
```

Экспортируется весь `historyState` – все чаты, все сообщения.

---

## 15. Подсказки / Suggestions & Alias

### 15.1 `suggestCommand` (did you mean)

Если вы ввели `/hlep` (опечатка), CLI предложит:  
`Unknown command "/hlep". Did you mean /help?`

Алгоритм: расстояние Левенштейна ≤ 2.

### 15.2 `/alias` (сокращения)

```bash
/alias                     # показать все алиасы
```

Встроенные алиасы (можно переопределить в `config.json`):

| Алиас | Команда |
|-------|---------|
| `/h`  | `/help` |
| `/q`  | `/exit` |
| `/m`  | `/model` |
| `/p`  | `/profile` |
| `/ls` | `/list` |
| `/cat`| `/read` |
| `/run`| `/shell` |
| `/ap` | `/autopilot` |
| `/pl` | `/plugin` |
| `/perm`|`/permissions`|
| `/ctx`| `/context` |
| `/rw` | `/rewind` |
| `/sess`|`/session` |
| `/ld` | `/lead` |
| `/del`| `/delegate` |
| `/mem`| `/memory` |
| `/pr` | `/preview` |
| `/rt` | `/routing` |
| `/i`  | `/init` |
| `/pv` | `/provider` |
| `/v`  | `/version` |
| `/ver`| `/version` |

---

## 16. Команды быстрого доступа (шпаргалка)

```bash
/help [topic]          # справка (/help chat, /help settings)
/clear                 # очистить текущий чат
/ap <задача>           # автопилот
/lead [--focus]        # Lead‑разработчик
/delegate <задача>     # делегировать под‑агенту
/chat new <name>       # новый чат
/context edit          # редактировать MEOW.md
/compact --ai          # сжать контекст с ИИ
/rewind                # откатить последние изменения
/session save          # сохранить сессию
/memory search <текст> # поиск по памяти
/routing on            # умная маршрутизация
/incognito on          # режим инкогнито
/trust grant           # довериться репозиторию
```

---

*Это полная документация по **Meow CLI v3**. Все команды, параметры, файлы конфигурации, инструменты и интеграции описаны максимально подробно. При возникновении вопросов – используйте `/help <тема>` внутри CLI.*
