"use strict";
// Helper functions to convert between camelCase and snake_case
Object.defineProperty(exports, "__esModule", { value: true });
exports.camelToSnake = exports.snakeToCamel = void 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var snakeToCamel = function (obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(exports.snakeToCamel);
    }
    return Object.keys(obj).reduce(function (acc, key) {
        var camelKey = key.replace(/_([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
        acc[camelKey] = (0, exports.snakeToCamel)(obj[key]);
        return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, {});
};
exports.snakeToCamel = snakeToCamel;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var camelToSnake = function (obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(exports.camelToSnake);
    }
    return Object.keys(obj).reduce(function (acc, key) {
        var snakeKey = key.replace(/[A-Z]/g, function (letter) { return "_".concat(letter.toLowerCase()); });
        // Special case for 'id' which should remain as is
        var finalKey = key === 'id' ? 'id' : snakeKey;
        // Skip File objects
        if (typeof window !== 'undefined' && obj[key] instanceof File) {
            // Skip File objects as they can't be serialized
            // We already handle this in saveToQueue by destructuring
        }
        // Handle Date objects
        else if (obj[key] instanceof Date) {
            acc[finalKey] = obj[key].toISOString();
        }
        // Handle other objects
        else if (typeof obj[key] === 'object' && obj[key] !== null) {
            acc[finalKey] = (0, exports.camelToSnake)(obj[key]);
        }
        // Handle primitive values
        else {
            acc[finalKey] = obj[key];
        }
        return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, {});
};
exports.camelToSnake = camelToSnake;
