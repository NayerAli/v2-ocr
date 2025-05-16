"use strict";
/**
 * Centralized logging utility for the application
 *
 * This file provides a set of logging functions that are environment-aware
 * and help reduce console noise in production environments.
 *
 * Usage:
 * - debugLog: For development-only debugging logs (not shown in production)
 * - debugError: For development and test errors (not shown in production)
 * - infoLog: For informational messages (not shown in production)
 * - warnLog: For warnings (not shown in production)
 * - prodLog: For critical logs that must always be shown (e.g., fatal errors)
 * - serverLog: For server-side logs with timestamps and request IDs
 * - serverError: For server-side error logs with timestamps and request IDs
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = debugLog;
exports.debugError = debugError;
exports.infoLog = infoLog;
exports.warnLog = warnLog;
exports.prodLog = prodLog;
exports.prodError = prodError;
exports.serverLog = serverLog;
exports.middlewareLog = middlewareLog;
exports.serverError = serverError;
exports.shouldLog = shouldLog;
// Determine if we're in production mode
var isProduction = process.env.NODE_ENV === 'production';
// List of allowed log patterns in production
var ALLOWED_PRODUCTION_LOGS = [
    'Middleware: Processing request for URL:',
    'Middleware: Route check -'
];
/**
 * Check if a log message should be shown in production
 */
function shouldShowInProduction(message) {
    if (!isProduction)
        return true;
    return ALLOWED_PRODUCTION_LOGS.some(function (pattern) {
        return typeof message === 'string' && message.startsWith(pattern);
    });
}
/**
 * Log debug messages (development only)
 * Use for verbose debugging information that should not appear in production
 */
function debugLog() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (process.env.NODE_ENV === 'development')
        console.log.apply(console, args);
}
/**
 * Log debug errors (development and test only)
 * Use for non-critical errors that are useful for debugging but not needed in production
 */
function debugError() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (process.env.NODE_ENV !== 'production')
        console.error.apply(console, args);
}
/**
 * Log informational messages (development and test only)
 * Use for general information that's helpful during development
 */
function infoLog() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (process.env.NODE_ENV !== 'production')
        console.info.apply(console, args);
}
/**
 * Log warnings (development and test only)
 * Use for potential issues that don't break functionality but should be addressed
 */
function warnLog() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (process.env.NODE_ENV !== 'production')
        console.warn.apply(console, args);
}
/**
 * Log critical messages (all environments)
 * Use for essential information that must be logged in all environments
 */
function prodLog() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.log.apply(console, args);
}
/**
 * Log critical errors (all environments)
 * Use for critical errors that must be logged in all environments
 */
function prodError() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.error.apply(console, args);
}
/**
 * Log server-side messages with timestamp and request ID
 * Use for server-side logging with consistent formatting
 */
function serverLog(requestId, message) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    var timestamp = new Date().toISOString();
    var reqIdStr = requestId ? "[".concat(requestId, "]") : '';
    console.log.apply(console, __spreadArray(["[SERVER] ".concat(timestamp, " ").concat(reqIdStr, " ").concat(message)], args, false));
}
/**
 * Log middleware messages - only important ones in production
 * @param type 'important' for logs that should show in production, 'debug' for dev-only logs
 */
function middlewareLog(type, message) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    // In development, show all logs
    // In production, only show logs that match the allowed patterns
    if (!isProduction || (type === 'important' && shouldShowInProduction(message))) {
        console.log.apply(console, __spreadArray([message], args, false));
    }
}
/**
 * Log server-side errors with timestamp and request ID
 * Use for server-side error logging with consistent formatting
 */
function serverError(requestId, message) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    var timestamp = new Date().toISOString();
    var reqIdStr = requestId ? "[".concat(requestId, "]") : '';
    console.error.apply(console, __spreadArray(["[SERVER-ERROR] ".concat(timestamp, " ").concat(reqIdStr, " ").concat(message)], args, false));
}
/**
 * Determine if a log should be shown based on frequency
 * Use to reduce log frequency for high-volume logs
 *
 * @param frequency Number between 0 and 1 representing the probability of logging
 * @returns Boolean indicating whether to log
 */
function shouldLog(frequency) {
    if (frequency === void 0) { frequency = 0.05; }
    return process.env.NODE_ENV === 'development' && Math.random() < frequency;
}
