"use strict";
// Mapper functions to convert between database and application formats
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapToOCRResult = exports.mapToProcessingStatus = void 0;
import { snakeToCamel } from "./case-conversion";
// Convert ProcessingStatus from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var mapToProcessingStatus = function (item) {
    console.log('[DEBUG] mapToProcessingStatus called with item:', item.id, item.filename);
    var status = snakeToCamel(item);
    console.log('[DEBUG] After snakeToCamel conversion:', status.id, status.filename);
    // Convert string dates to Date objects
    if (status.createdAt && typeof status.createdAt === 'string') {
        status.createdAt = new Date(status.createdAt);
    }
    if (status.updatedAt && typeof status.updatedAt === 'string') {
        status.updatedAt = new Date(status.updatedAt);
    }
    if (status.processingStartedAt && typeof status.processingStartedAt === 'string') {
        status.processingStartedAt = new Date(status.processingStartedAt);
    }
    if (status.processingCompletedAt && typeof status.processingCompletedAt === 'string') {
        status.processingCompletedAt = new Date(status.processingCompletedAt);
    }
    console.log('[DEBUG] Final status object:', status.id, status.filename, status.status);
    return status;
};
exports.mapToProcessingStatus = mapToProcessingStatus;
// Convert OCRResult from Supabase to application format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var mapToOCRResult = function (item) {
    var result = snakeToCamel(item);
    return result;
};
exports.mapToOCRResult = mapToOCRResult;
