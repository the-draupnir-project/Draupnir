// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import postgres from "postgres";

export async function runSchema(sql: postgres.Sql) {
  await sql.begin((s) => [
    s`ALTER TABLE IF EXISTS mjolnir RENAME TO draupnir;`,
  ]);
}
