"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const argon2_1 = __importDefault(require("argon2"));
async function hashPassword(password) {
    return argon2_1.default.hash(password, {
        type: argon2_1.default.argon2id,
        memoryCost: 65536, // 64 MB
        timeCost: 3,
        parallelism: 1,
    });
}
async function verifyPassword(hash, plain) {
    try {
        return await argon2_1.default.verify(hash, plain);
    }
    catch (err) {
        return false;
    }
}
//# sourceMappingURL=argon2.js.map