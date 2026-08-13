import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPool } from "../config/database.js";

export async function loginService({
    email,
    password
}) {
    if (
        typeof email !== "string" ||
        email.trim() === ""
    ) {
        throw new Error(
            "Email is required"
        );
    }

    if (
        typeof password !== "string" ||
        password === ""
    ) {
        throw new Error(
            "Password is required"
        );
    }

    const pool = getPool();

    const [rows] = await pool.query(
        `
        SELECT
            id,
            name,
            email,
            password_hash,
            role,
            is_active
        FROM users
        WHERE email = ?
        LIMIT 1
        `,
        [email.trim()]
    );

    /*
     * Do not reveal whether the email exists.
     */
    if (rows.length === 0) {
        throw new Error(
            "Invalid email or password"
        );
    }

    const user = rows[0];

    if (!user.is_active) {
        throw new Error(
            "Invalid email or password"
        );
    }

    if (!user.password_hash) {
        throw new Error(
            "Invalid email or password"
        );
    }

    const passwordMatches =
        await bcrypt.compare(
            password,
            user.password_hash
        );

    if (!passwordMatches) {
        throw new Error(
            "Invalid email or password"
        );
    }

    if (!process.env.JWT_SECRET) {
        throw new Error(
            "Authentication configuration is missing"
        );
    }

    const token =
        jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

    return {
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
}