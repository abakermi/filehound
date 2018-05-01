"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isMethod(propertyName, value) {
    return propertyName !== 'constructor' && typeof value === 'function';
}
exports.default = (obj) => {
    const propertyNames = Object.getOwnPropertyNames(obj.constructor.prototype);
    propertyNames.forEach((propertyName) => {
        const value = obj[propertyName];
        if (isMethod(propertyName, value)) {
            obj[propertyName] = value.bind(obj);
        }
    });
};
//# sourceMappingURL=bind.js.map