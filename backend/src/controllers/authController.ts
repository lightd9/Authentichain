import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import pool from "../db";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["manufacturer", "supplier", "retailer"] as const, {
  message: "Role must be manufacturer, supplier or retailer",
  }),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, email, password, role } = parsed.data;

  try {
    const hashed = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO organizations (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, hashed, role]
    );
    res.status(201).json({ organization: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      "SELECT * FROM organizations WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const org = result.rows[0];
    const valid = await bcrypt.compare(password, org.password);

    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { id: org.id, email: org.email, role: org.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      organization: {
        id: org.id,
        name: org.name,
        email: org.email,
        role: org.role,
      },
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
};