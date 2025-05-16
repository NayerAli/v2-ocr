"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("../lib/database/utils");
var auth_1 = require("../lib/auth");
function migrateBase64ImagesToStorage() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, results, error, migrated, skipped, failed, _i, results_1, result, base64, byteCharacters, byteNumbers, i, blob, user, path, uploadError, updateError, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('Starting migration of base64 images to storage_path...');
                    return [4 /*yield*/, utils_1.supabase
                            .from('ocr_results')
                            .select('*')];
                case 1:
                    _a = _b.sent(), results = _a.data, error = _a.error;
                    if (error) {
                        console.error('Error fetching OCR results:', error);
                        process.exit(1);
                    }
                    migrated = 0;
                    skipped = 0;
                    failed = 0;
                    _i = 0, results_1 = results;
                    _b.label = 2;
                case 2:
                    if (!(_i < results_1.length)) return [3 /*break*/, 9];
                    result = results_1[_i];
                    if (result.storage_path) {
                        console.log("[SKIP] Result ".concat(result.id, " already has storage_path: ").concat(result.storage_path));
                        skipped++;
                        return [3 /*break*/, 8];
                    }
                    if (!result.image_url || !result.image_url.startsWith('data:image/')) {
                        console.log("[SKIP] Result ".concat(result.id, " has no base64 image_url"));
                        skipped++;
                        return [3 /*break*/, 8];
                    }
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 7, , 8]);
                    base64 = result.image_url.split(',')[1];
                    byteCharacters = atob(base64);
                    byteNumbers = new Array(byteCharacters.length);
                    for (i = 0; i < byteCharacters.length; i++)
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
                    return [4 /*yield*/, (0, auth_1.getUser)()];
                case 4:
                    user = _b.sent();
                    if (!user) {
                        console.error("[FAIL] Could not get user for result ".concat(result.id));
                        failed++;
                        return [3 /*break*/, 8];
                    }
                    path = "".concat(user.id, "/").concat(result.document_id, "/migrated_").concat(result.page_number || 1, ".jpg");
                    return [4 /*yield*/, utils_1.supabase.storage.from('ocr-documents').upload(path, blob, { upsert: false })];
                case 5:
                    uploadError = (_b.sent()).error;
                    if (uploadError && !uploadError.message.includes('The resource already exists')) {
                        console.error("[FAIL] Upload error for result ".concat(result.id, ":"), uploadError);
                        failed++;
                        return [3 /*break*/, 8];
                    }
                    return [4 /*yield*/, utils_1.supabase
                            .from('ocr_results')
                            .update({ storage_path: path })
                            .eq('id', result.id)];
                case 6:
                    updateError = (_b.sent()).error;
                    if (updateError) {
                        console.error("[FAIL] DB update error for result ".concat(result.id, ":"), updateError);
                        failed++;
                        return [3 /*break*/, 8];
                    }
                    console.log("[OK] Migrated result ".concat(result.id, " to storage path ").concat(path));
                    migrated++;
                    return [3 /*break*/, 8];
                case 7:
                    err_1 = _b.sent();
                    console.error("[FAIL] Exception for result ".concat(result.id, ":"), err_1);
                    failed++;
                    return [3 /*break*/, 8];
                case 8:
                    _i++;
                    return [3 /*break*/, 2];
                case 9:
                    console.log('--- Migration Summary ---');
                    console.log("Migrated: ".concat(migrated));
                    console.log("Skipped: ".concat(skipped));
                    console.log("Failed: ".concat(failed));
                    console.log('Migration complete.');
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
migrateBase64ImagesToStorage();
