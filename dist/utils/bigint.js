"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializeBigInts = serializeBigInts;
function serializeBigInts(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'bigint') {
        return Number(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(serializeBigInts);
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                result[key] = serializeBigInts(obj[key]);
            }
        }
        return result;
    }
    return obj;
}
