import postgres from "postgres";

export async function runSchema(sql: postgres.Sql) {
  await sql.begin((s) => [
    s`ALTER TABLE IF EXISTS mjolnir RENAME TO draupnir;`,
  ]);
}
