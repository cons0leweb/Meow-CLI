/**
 * Schema Loader — загружает api-schema.json и предоставляет
 * удобный доступ к его содержимому из любого модуля.
 *
 * Использование:
 *   import { getSchema, getModule, getMethod, getDefinition, validateParams } from "./schema-loader.js";
 *   const schema = getSchema();
 *   const chatMethods = getModule("chat");
 *   const sendMsg = getMethod("chat", "sendMessage");
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "../../api-schema.json");

/** @type {Object|null} Кешированная схема */
let _schema = null;

/**
 * Загружает и возвращает полный объект схемы из api-schema.json.
 * Результат кешируется после первого вызова.
 * @returns {Object} Схема API
 */
export function getSchema() {
  if (!_schema) {
    if (!existsSync(SCHEMA_PATH)) {
      throw new Error(
        `api-schema.json not found at ${SCHEMA_PATH}. ` +
        "Run from project root or ensure the file exists."
      );
    }
    const raw = readFileSync(SCHEMA_PATH, "utf8");
    _schema = JSON.parse(raw);
  }
  return _schema;
}

/**
 * Принудительно перезагружает схему с диска (сбрасывает кеш).
 * @returns {Object} Свежая схема
 */
export function reloadSchema() {
  _schema = null;
  return getSchema();
}

/**
 * Возвращает описание модуля по имени.
 * @param {string} moduleName — имя модуля (например "chat", "tools", "config")
 * @returns {Object|null} Модуль или null, если не найден
 */
export function getModule(moduleName) {
  const schema = getSchema();
  return schema.modules?.[moduleName] || null;
}

/**
 * Возвращает описание метода в указанном модуле.
 * @param {string} moduleName — имя модуля
 * @param {string} methodName — имя метода
 * @returns {Object|null} Метод или null
 */
export function getMethod(moduleName, methodName) {
  const mod = getModule(moduleName);
  if (!mod) return null;
  return mod.methods?.[methodName] || null;
}

/**
 * Возвращает определение типа из раздела definitions.
 * @param {string} name — имя определения (например "Config", "ChatResponse")
 * @returns {Object|null} Определение или null
 */
export function getDefinition(name) {
  const schema = getSchema();
  return schema.definitions?.[name] || null;
}

/**
 * Проверяет переданные параметры на соответствие схеме метода.
 * Возвращает массив ошибок валидации (пустой массив — всё ок).
 *
 * @param {string} moduleName — имя модуля
 * @param {string} methodName — имя метода
 * @param {Object} params — переданные параметры
 * @returns {Array<{param: string, message: string}>} Ошибки валидации
 */
export function validateParams(moduleName, methodName, params) {
  const method = getMethod(moduleName, methodName);
  if (!method) return [{ param: "*", message: `Method ${moduleName}.${methodName} not found in schema` }];

  const errors = [];

  for (const [paramName, paramDef] of Object.entries(method.params || {})) {
    const value = params[paramName];

    // Проверка required (по отсутствию default)
    if (value === undefined && paramDef.default === undefined && paramDef.required !== false) {
      errors.push({ param: paramName, message: `Missing required parameter: ${paramName}` });
      continue;
    }

    if (value === undefined) continue;

    // Проверка типа
    const expectedType = paramDef.type;
    if (expectedType) {
      const actualType = Array.isArray(value) ? "array" : typeof value;
      const typeMap = {
        string: "string",
        number: "number",
        boolean: "boolean",
        object: "object",
        array: "array",
        any: "any",
      };
      if (typeMap[expectedType] && actualType !== typeMap[expectedType] && expectedType !== "any") {
        errors.push({
          param: paramName,
          message: `Expected type '${expectedType}', got '${actualType}'`,
        });
      }
    }

    // Проверка enum
    if (paramDef.enum && !paramDef.enum.includes(value)) {
      errors.push({
        param: paramName,
        message: `Value '${value}' not in enum: ${paramDef.enum.join(", ")}`,
      });
    }
  }

  return errors;
}

/**
 * Возвращает список всех имён модулей.
 * @returns {string[]}
 */
export function listModules() {
  const schema = getSchema();
  return Object.keys(schema.modules || {});
}

/**
 * Возвращает список всех методов в модуле.
 * @param {string} moduleName — имя модуля
 * @returns {Array<{name: string, description: string}>}
 */
export function listMethods(moduleName) {
  const mod = getModule(moduleName);
  if (!mod) return [];
  return Object.entries(mod.methods || {}).map(([name, def]) => ({
    name,
    description: def.description || "",
  }));
}

/**
 * Проверяет, что версия схемы совпадает с версией приложения.
 * Выводит warning в консоль при несовпадении.
 * @param {string} appVersion — текущая версия приложения (из package.json)
 */
export function checkSchemaVersion(appVersion) {
  try {
    const schema = getSchema();
    const schemaVersion = schema.version;
    if (schemaVersion && appVersion && schemaVersion !== appVersion) {
      console.warn(
        `[Schema] Version mismatch: api-schema.json v${schemaVersion} vs app v${appVersion}. ` +
        "Consider regenerating the schema."
      );
    }
  } catch {
    // ignore
  }
}

export default {
  getSchema,
  reloadSchema,
  getModule,
  getMethod,
  getDefinition,
  validateParams,
  listModules,
  listMethods,
  checkSchemaVersion,
};
