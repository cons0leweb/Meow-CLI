import path from "path";
import os from "os";

/** @type {string} Base directory for Meow CLI data */
const DATA_DIR = path.join(os.homedir(), ".meowcli", "data");
/** @type {string} Path to chat history file */
const HIST_FILE = path.join(DATA_DIR, "history.json");
/** @type {string} Path to configuration file */
const CONF_FILE = path.join(DATA_DIR, "config.json");
/** @type {string} Path to encrypted configuration file */
const CONF_FILE_ENC = path.join(DATA_DIR, "config.json.mc");
/** @type {string} Directory for autopilot logs */
const LOG_DIR = path.join(DATA_DIR, "logs");
/** @type {string} Path to undo/checkpoint state */
const UNDO_FILE = path.join(DATA_DIR, "undo.json");
/** @type {string} Directory for custom assistant profiles */
const ASSIST_DIR = path.join(DATA_DIR, "assistants");
/** @type {string} Path to pinned messages */
const PIN_FILE = path.join(DATA_DIR, "pins.json");
/** @type {string} Directory for user plugins */
const PLUGIN_DIR = path.join(DATA_DIR, "plugins");
/** @type {string} Path to tool permissions storage */
const PERM_FILE = path.join(DATA_DIR, "permissions.json");
/** @type {string} Path to trust state storage */
const TRUST_FILE = path.join(DATA_DIR, "trust.json");
/** @type {string} Directory for saved sessions */
const SESSION_DIR = path.join(DATA_DIR, "sessions");
/** @type {string} Directory for file-system checkpoints */
const CHECKPOINT_DIR = path.join(DATA_DIR, "checkpoints");
/** @type {string} Path to cost/usage tracking data */
const COST_FILE = path.join(DATA_DIR, "cost.json");
/** @type {string} Path to global project context file */
const GLOBAL_MEOW_MD = path.join(os.homedir(), ".meowcli", "MEOW.md");

/** @type {string} Legacy history path (pre-v2) */
const LEGACY_HIST_FILE = path.join(os.homedir(), ".meowcli_history.json");
/** @type {string} Legacy config path (pre-v2) */
const LEGACY_CONF_FILE = path.join(os.homedir(), ".meowcli.json");
/** @type {string} Legacy log directory (pre-v2) */
const LEGACY_LOG_DIR = path.join(os.homedir(), ".meowcli_logs");

/**
 * Default application configuration.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  api_base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  api_key: process.env.OPENAI_API_KEY || "",
  model: process.env.OPENAI_MODEL || "gpt-4-turbo",
  auto_yes: process.env.AI_AUTO_YES === "1",
  quiet: false,
  profile: "default",
  theme: process.env.MEOW_THEME || "default",
  lang: process.env.AI_LANG || "ru",
  git: {
    autocommit: true,
    prefix: "",
    ai_message: true,
    ai_max_diff_chars: 6000
  },
  autopilot: {
    max_iterations: 50,
    max_errors: 5,
    retry_delay_ms: 2000,
    save_log: true,
    trigger_cmd: "",
  },
  prompt_optimizer: {
    enabled: false,
    model: "", // Empty means use current model
    verbose: true,
  },
  plugins: {
    disabled: [],
  },
  vacuum: {
    enabled: true,
    keep_last: 1,
    drop_count: 4
  },
  profiles: {
    default: {
      temperature: 0.2,
      system: "Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу. Используй инструменты для работы с файлами и системой."
    },
    creative: {
      temperature: 0.7,
      system: "Ты — креативный помощник. Предлагай нестандартные идеи и развернутые объяснения."
    }
  },
  aliases: {
    "/h": "/help",
    "/q": "/exit",
    "/m": "/model",
    "/p": "/profile",
    "/ls": "/list",
    "/cat": "/read",
    "/run": "/shell",
    "/ap": "/autopilot",
    "/auto": "/autopilot",
    "/pl": "/plugin",
    "/perm": "/permissions",
    "/ctx": "/context",
    "/rw": "/rewind",
    "/sess": "/session",
    "/ld": "/lead",
    "/del": "/delegate",
    "/mem": "/memory",
    "/pr": "/preview",
    "/rt": "/routing",
    "/i": "/init",
    "/pv": "/provider",
    "/v": "/version",
    "/ver": "/version",
    "/trust": "/trust",
    "/opt": "/optimize",
    "/mcp": "/mcp",
    "/ix": "/index",
    "/f": "/find",
  },
  providers: {},
  mcp_servers: {},
  active_provider: "",
  api_schema: "openai",
  meowcube_url: process.env.MEOWCUBE_URL || "https://meowcube.space",
  trust_url: "https://raw.githubusercontent.com/meowcli/meow-cli/main/globals/trust/trust.meow",
  templates: {
    "fix": "Исправь ошибку в следующем коде: {code}. Объясни, в чем была проблема.",
    "refactor": "Отрефактори этот файл: {file}. Улучши читаемость и производительность.",
    "explain": "Объясни, что делает этот код: {context}."
  }
};

/**
 * Internationalization strings.
 * @type {Object}
 */
const I18N = {
  ru: {
    banner_subtitle: "Meow CLI все модели в одном месте",
    api_key_missing_title: "API-ключ не найден",
    api_key_missing_hint: "Используй /key sk-... чтобы установить его.",
    type_help: "Введи /help для списка команд",
    help_title_chat: "💬 Чат",
    help_title_autopilot: "🤖 Автопилот",
    help_title_images: "🖼 Изображения",
    help_title_tools: "🔧 Инструменты",
    help_title_settings: "⚙️ Настройки",
    help_title_other: "📦 Другое",
    cmd_clear: "Очистить текущий контекст чата",
    cmd_chat_list: "Показать все чаты",
    cmd_chat_new: "Создать новый чат",
    cmd_chat_use: "Переключиться на другой чат",
    cmd_chat_delete: "Удалить чат",
    cmd_autopilot: "Запустить автопилот с задачей",
    cmd_autopilot_short: "Короткий алиас для автопилота",
    cmd_ap_config: "Показать настройки автопилота",
    cmd_ap_limit: "Установить максимум итераций (по умолч. 50)",
    cmd_ap_errors: "Установить максимум ошибок (по умолч. 5)",
    cmd_trigger: "Выполнить команду после завершения автопилота",
    cmd_ctrl_c: "Остановить автопилот корректно",
    cmd_img_path: "Отправить изображение с вопросом",
    cmd_img_url: "Отправить изображение по ссылке",
    cmd_img_inline: "Вставить изображение прямо в сообщение",
    cmd_list: "Показать содержимое папки",
    cmd_read: "Прочитать содержимое файла",
    cmd_shell: "Выполнить команду в терминале",
    cmd_model: "Сменить модель",
    cmd_profile: "Сменить профиль",
    cmd_assistant: "Управлять кастомными ассистентами",
    cmd_temp: "Установить температуру",
    cmd_key: "Установить API-ключ",
    cmd_url: "Указать базовый URL",
    cmd_login: "Авторизация через MeowCube",
    cmd_logout: "Выйти из аккаунта",
    cmd_whoami: "Показать текущего пользователя",
    cmd_config: "Показать текущую конфигурацию",
    cmd_theme: "Сменить тему оформления (/theme для списка)",
    cmd_provider: "Управление провайдерами API",
    cmd_git: "Настройка авто-коммитов и префиксов git",
    cmd_undo: "Отменить последние N изменений (простой откат)",
    cmd_rewind: "Откатить проект на N чекпоинтов назад",
    cmd_checkpoint: "Список или создание чекпоинтов системы",
    cmd_export: "Экспортировать историю в JSON",
    cmd_import: "Импортировать историю из JSON",
    cmd_template: "Использовать шаблон промпта",
    cmd_compact: "Сжать контекст беседы (экономия токенов)",
    cmd_lead: "Режим Lead Developer (автономная работа)",
    cmd_delegate: "Делегировать задачу под-агенту",
    cmd_pair: "Режим парного программирования",
    cmd_ci: "Управление CI/CD (статус, генерация, лечение)",
    cmd_memory: "Управление памятью проекта (RAG)",
    cmd_routing: "Умная маршрутизация между моделями",
    cmd_permissions: "Управление правами доступа инструментов",
    cmd_context: "Управление контекстом проекта (MEOW.md)",
    cmd_audit: "Просмотр лога аудита безопасности",
    cmd_mcp: "Управление серверами MCP (Model Context Protocol)",
    cmd_incognito: "Режим инкогнито (без сохранения данных)",
    cmd_session: "Управление сессиями чата (save/load/list)",
    cmd_cost: "Просмотр стоимости и использования токенов",
    cmd_init: "Инициализация индекса проекта",
    cmd_preview: "Предпросмотр сервера разработки",
    cmd_saveconfig: "Сохранить текущие настройки в файл",
    cmd_pins: "Показать список закреплённых сообщений",
    cmd_pin: "Закрепить последнее или конкретное сообщение",
    cmd_vacuum: "Настроить очистку чата",
    cmd_alias: "Показать алиасы команд",
    cmd_stats: "Показать статус",
    cmd_optimize: "Настроить оптимизатор промптов",
    cmd_plugin: "Управление плагинами",
    cmd_version: "Показать версию и проверить обновления",
    cmd_update: "Проверить и показать инструкцию по обновлению",
    cmd_help: "Показать эту справку",
    cmd_exit: "Выйти",
    cmd_trust: "Проверить статус доверия или довериться текущему репозиторию",
    trust_status: "Статус доверия: {status}",
    trust_trusted: "ДОВЕРЕННЫЙ",
    trust_untrusted: "НЕ ДОВЕРЕННЫЙ (только чтение)",
    trust_blacklisted: "В ЧЁРНОМ СПИСКЕ (угроза безопасности)",
    trust_granted: "Ты доверился текущему репозиторию.",
    trust_blocked: "Нельзя довериться: у репозитория плохая репутация.",
    trust_readonly_warning: "Репозиторий не доверенный. Работа в режиме ТОЛЬКО ЧТЕНИЕ.",
    stats_title: "◆ Статус",
    tips_title: "✨ Советы",
    tips_body: `• /help — помощь\n• /pin — сохранить полезный ответ\n• /vacuum on drop:4 keep:1 — автоочистка\n• /plugin list — управление плагинами`,
  },
  en: {
    banner_subtitle: "MeowCLI - Every model in your terminal ",
    api_key_missing_title: "API Key not found",
    api_key_missing_hint: "Use /key sk-... to set it.",
    type_help: "Type /help for commands",
    help_title_chat: "💬 Chat",
    help_title_autopilot: "🤖 Autopilot",
    help_title_images: "🖼  Images",
    help_title_tools: "🔧 Tools",
    help_title_settings: "⚙️  Settings",
    help_title_other: "📦 Other",
    cmd_clear: "Clear current chat context",
    cmd_chat_list: "List all chats",
    cmd_chat_new: "Create new chat",
    cmd_chat_use: "Switch to chat",
    cmd_chat_delete: "Delete chat",
    cmd_autopilot: "Start autopilot with a task",
    cmd_autopilot_short: "Short alias for autopilot",
    cmd_ap_config: "Show autopilot settings",
    cmd_ap_limit: "Set max iterations (default 50)",
    cmd_ap_errors: "Set max errors (default 5)",
    cmd_trigger: "Run command on autopilot completion",
    cmd_ctrl_c: "Stop autopilot gracefully",
    cmd_img_path: "Send image with optional question",
    cmd_img_url: "Send image by URL",
    cmd_img_inline: "Inline image in message",
    cmd_list: "List directory contents",
    cmd_read: "Read file contents",
    cmd_shell: "Execute shell command",
    cmd_model: "Change model",
    cmd_profile: "Change profile",
    cmd_assistant: "List/create/use custom assistants",
    cmd_temp: "Set temperature",
    cmd_key: "Set API key",
    cmd_url: "Set base URL",
    cmd_login: "Login via MeowCube",
    cmd_logout: "Logout from account",
    cmd_whoami: "Show current user",
    cmd_config: "Show current config",
    cmd_theme: "Change color theme (/theme to list)",
    cmd_provider: "Manage API providers",
    cmd_git: "Configure git auto-commits and prefixes",
    cmd_undo: "Undo last N file changes (simple undo)",
    cmd_rewind: "Rewind project to N checkpoints back",
    cmd_checkpoint: "List or create system checkpoints",
    cmd_export: "Export history to JSON",
    cmd_import: "Import history from JSON",
    cmd_template: "Use prompt template",
    cmd_compact: "Compress conversation context",
    cmd_lead: "Lead Developer mode (autonomous)",
    cmd_delegate: "Delegate task to a sub-agent",
    cmd_pair: "Pair programming mode",
    cmd_ci: "Manage CI/CD (status, generate, heal)",
    cmd_memory: "Manage project memory (RAG)",
    cmd_routing: "Smart model routing",
    cmd_permissions: "Manage tool permissions",
    cmd_context: "Manage project context (MEOW.md)",
    cmd_audit: "Show security audit log",
    cmd_mcp: "Manage MCP (Model Context Protocol) servers",
    cmd_incognito: "Incognito mode (no data persists)",
    cmd_session: "Manage chat sessions (save/load/list)",
    cmd_cost: "Show token usage & cost",
    cmd_init: "Initialize project index",
    cmd_preview: "Live dev server preview",
    cmd_saveconfig: "Save current config to file",
    cmd_pins: "List pinned messages",
    cmd_pin: "Pin last or specific message",
    cmd_vacuum: "Configure chat vacuum",
    cmd_alias: "Show aliases",
    cmd_stats: "Show status",
    cmd_optimize: "Configure prompt optimizer",
    cmd_plugin: "Manage plugins",
    cmd_version: "Show version & check for updates",
    cmd_update: "Check for updates and show upgrade instructions",
    cmd_help: "This help",
    cmd_exit: "Quit",
    cmd_trust: "Check or grant trust to current repository",
    trust_status: "Trust status: {status}",
    trust_trusted: "TRUSTED",
    trust_untrusted: "UNTRUSTED (Read-only mode)",
    trust_blacklisted: "BLACKLISTED (Security risk)",
    trust_granted: "Trust granted to this repository.",
    trust_blocked: "Cannot grant trust: repository has a bad reputation.",
    trust_readonly_warning: "Repository is not trusted. Operating in READ-ONLY mode.",
    stats_title: "◆ Status",
    tips_title: "✨ Tips",
    tips_body: `• /help — help\n• /pin — save useful reply\n• /vacuum on drop:4 keep:1 — auto cleanup\n• /plugin list — manage plugins`,
  }
};

/**
 * Translates a key to the current language.
 * @param {Object} cfg - Application configuration.
 * @param {string} key - Translation key.
 * @param {string} [fallback=""] - Fallback string.
 * @returns {string} Translated string.
 */
function t(cfg, key, fallback = "") {
  const lang = cfg?.lang || "ru";
  return (I18N[lang] && I18N[lang][key]) || I18N.ru[key] || fallback || key;
}

export { DATA_DIR, HIST_FILE, CONF_FILE, LOG_DIR, UNDO_FILE, ASSIST_DIR, PIN_FILE, PLUGIN_DIR, PERM_FILE, TRUST_FILE, SESSION_DIR, CHECKPOINT_DIR, COST_FILE, GLOBAL_MEOW_MD, LEGACY_HIST_FILE, LEGACY_CONF_FILE, LEGACY_LOG_DIR, DEFAULT_CONFIG, I18N, t };
