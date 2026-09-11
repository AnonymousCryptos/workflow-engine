import {
    searchMaster
} from "../database/master.repository.js";

export async function getMasterValues({
    master,
    search = "",
    page = 1,
    limit = 20,
    godownId
}) {
    if (
        typeof master !== "string" ||
        master.trim() === ""
    ) {
        throw new Error(
            "Master is required"
        );
    }

    const normalizedMaster =
        master.trim().toLowerCase();

    const allowedMasters = [
        "sku",
        "party",
        "user",
        "godown",
        "rack"
    ];

    if (
        !allowedMasters.includes(
            normalizedMaster
        )
    ) {
        throw new Error(
            `Unknown master: ${normalizedMaster}`
        );
    }

    const normalizedPage =
        Number(page);

    const normalizedLimit =
        Number(limit);

    if (
        !Number.isInteger(
            normalizedPage
        ) ||
        normalizedPage < 1
    ) {
        throw new Error(
            "Page must be a positive integer"
        );
    }

    if (
        !Number.isInteger(
            normalizedLimit
        ) ||
        normalizedLimit < 1 ||
        normalizedLimit > 100
    ) {
        throw new Error(
            "Limit must be between 1 and 100"
        );
    }

    const normalizedSearch =
        typeof search === "string"
            ? search.trim()
            : "";

    let normalizedGodownId;

    if (
        normalizedMaster === "rack"
    ) {
        normalizedGodownId =
            Number(godownId);

        if (
            !Number.isInteger(
                normalizedGodownId
            ) ||
            normalizedGodownId < 1
        ) {
            throw new Error(
                "godown_id must be a positive integer for rack lookup"
            );
        }
    }

    return searchMaster(
        normalizedMaster,
        normalizedSearch,
        normalizedPage,
        normalizedLimit,
        normalizedMaster === "rack"
            ? {
                  godown_id:
                      normalizedGodownId
              }
            : {}
    );
}