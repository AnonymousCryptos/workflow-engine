import crypto from "crypto";
const validations = new Map();

const VALIDATION_TTL =
    30 * 60 * 1000;

export function createValidation(
    data
) {
    const validationId =
        crypto.randomUUID();

    validations.set(
        validationId,
        {
            ...data,
            createdAt: Date.now()
        }
    );

    return validationId;
}

export function getValidation(
    validationId
) {
    const validation =
        validations.get(
            validationId
        );

    if (!validation) {
        return null;
    }

    if (
        Date.now() -
            validation.createdAt >
        VALIDATION_TTL
    ) {
        validations.delete(
            validationId
        );

        return null;
    }

    return validation;
}

export function deleteValidation(
    validationId
) {
    validations.delete(
        validationId
    );
}