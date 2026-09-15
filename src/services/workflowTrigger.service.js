import {
    applyStockMovement
} from "./stock.service.js";

async function executeStockMovementTrigger({
    trigger,
    stageData,
    connection
}) {
    const itemsField =
        trigger.itemsField;

    if (
        typeof itemsField !== "string" ||
        itemsField.trim() === ""
    ) {
        throw new Error(
            "Stock movement trigger must define itemsField"
        );
    }

    let movementType;

    if (
        trigger.movementField !==
            undefined
    ) {
        movementType =
            stageData?.[
                trigger.movementField
            ];
    } else {
        movementType =
            trigger.movementValue;
    }

    if (
        movementType !== "In" &&
        movementType !== "Out"
    ) {
        throw new Error(
            `Invalid stock movement type: ${movementType}`
        );
    }

    const items =
        stageData?.[itemsField];

    if (!Array.isArray(items)) {
        throw new Error(
            `Stock movement field "${itemsField}" must contain an array`
        );
    }

    for (const item of items) {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            throw new Error(
                `Invalid item in stock movement field "${itemsField}"`
            );
        }

        await applyStockMovement({
            sku: item.sku,
            godownId:
                item.godown,
            rackId:
                item.rack,
            quantity:
                item.quantity,
            movementType,
            connection
        });
    }
}


export async function executeStageTriggers({
    triggers,
    stageData,
    connection
}) {
    if (
        triggers === undefined ||
        triggers === null
    ) {
        return;
    }

    if (!Array.isArray(triggers)) {
        throw new Error(
            "Stage triggers must be an array"
        );
    }

    for (const trigger of triggers) {
        if (
            trigger.type ===
            "stock_movement"
        ) {
            await executeStockMovementTrigger({
                trigger,
                stageData,
                connection
            });

            continue;
        }

        throw new Error(
            `Unsupported trigger type "${trigger.type}"`
        );
    }
}