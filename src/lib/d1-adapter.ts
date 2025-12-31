import type { CustomAdapter } from "@better-auth/core/db/adapter";
import type { CleanedWhere } from "better-auth/adapters";
import type { Where } from "better-auth/types";
import { createAdapterFactory } from "better-auth/adapters";

function adapt({
  model: rawModel,
  select,
  where,
}: {
  model: string;
  select?: string[];
  where?: Where[];
}) {
  const model =
    rawModel[0] === rawModel[0].toLowerCase()
      ? rawModel[0].toUpperCase() + rawModel.slice(1)
      : rawModel;
  const modelId = model[0].toLowerCase() + model.slice(1) + "Id";

  return {
    model,
    modelId,
    selectClause: select?.length
      ? select.map((s) => (s === "id" ? modelId : s)).join(", ")
      : "*",
    ...adaptWhere({ where, modelId }),
    mapResult: <T extends Record<string, unknown>>(result?: T | null) => {
      if (!result) return null;
      const id = result[modelId];
      return id === undefined ? result : { ...result, id };
    },
  };
}

function adaptWhere({ where, modelId }: { where?: Where[]; modelId: string }): {
  whereClause?: string;
  whereValues: unknown[];
} {
  if (!where || where.length === 0)
    return { whereClause: undefined, whereValues: [] };

  const serializeWhereValue = (v: unknown): unknown =>
    v instanceof Date ? v.toISOString() : v;

  const clauses: string[] = [];
  const whereValues: unknown[] = [];
  for (const w of where) {
    type Operator = NonNullable<Where["operator"]>;
    const op = (w.operator ?? "eq") as Operator;
    const field = w.field === "id" ? modelId : w.field;
    let sql = "";
    switch (op) {
      case "eq":
        sql = `${field} = ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "ne":
        sql = `${field} <> ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "lt":
        sql = `${field} < ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "lte":
        sql = `${field} <= ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "gt":
        sql = `${field} > ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "gte":
        sql = `${field} >= ?`;
        whereValues.push(serializeWhereValue(w.value));
        break;
      case "in":
        if (Array.isArray(w.value) && w.value.length > 0) {
          sql = `${field} in (${w.value.map(() => "?").join(",")})`;
          whereValues.push(...w.value.map(serializeWhereValue));
        } else {
          sql = "0";
        }
        break;
      case "not_in":
        if (Array.isArray(w.value) && w.value.length > 0) {
          sql = `${field} not in (${w.value.map(() => "?").join(",")})`;
          whereValues.push(...w.value.map(serializeWhereValue));
        } else {
          sql = "1";
        }
        break;
      case "contains":
        sql = `${field} like ?`;
        whereValues.push(`%${String(serializeWhereValue(w.value))}%`);
        break;
      case "starts_with":
        sql = `${field} like ?`;
        whereValues.push(`${String(serializeWhereValue(w.value))}%`);
        break;
      case "ends_with":
        sql = `${field} like ?`;
        whereValues.push(`%${String(serializeWhereValue(w.value))}`);
        break;
      default:
        void (op satisfies never);
        throw new Error(`Unsupported where operator: ${String(op)}`);
    }
    clauses.push(sql);
  }
  let whereClause = clauses[0];
  for (let i = 1; i < clauses.length; i++) {
    whereClause = `${whereClause} ${where[i].connector ?? "and"} ${clauses[i]}`;
  }
  return { whereClause, whereValues };
}

export const d1Adapter = (db: D1Database | D1DatabaseSession) => {
  return createAdapterFactory({
    config: {
      adapterId: "d1-adapter",
      adapterName: "D1 Adapter",
      supportsNumericIds: true,
      supportsDates: false,
      supportsBooleans: false,
      disableIdGeneration: true,
      debugLogs: false,
      customTransformOutput: ({ field, data }) => {
        if (field === "activeOrganizationId" && typeof data === "number") {
          return String(data);
        }
        return data;
      },
    },
    adapter: () => {
      const create: CustomAdapter["create"] = async ({
        model,
        data,
        select,
      }) => {
        const adapted = adapt({ model, select });
        const keys = Object.keys(data);
        const values = keys.map((k) => data[k]);
        const placeholders = keys.map(() => "?").join(",");
        const sql = `insert into ${adapted.model} (${keys.join(",")}) values (${placeholders}) returning ${adapted.selectClause}`;
        const result = adapted.mapResult<typeof data>(
          await db
            .prepare(sql)
            .bind(...values)
            .first(),
        );
        if (!result) {
          throw new Error(`Failed to create record in ${model}`);
        }
        return result;
      };

      const findOne: CustomAdapter["findOne"] = async ({
        model,
        where,
        select,
      }) => {
        const adapted = adapt({ model, select, where });
        const sql = `select ${adapted.selectClause} from ${adapted.model} ${adapted.whereClause ? `where ${adapted.whereClause}` : ""} limit 1`;
        return adapted.mapResult<Record<string, unknown>>(
          await db
            .prepare(sql)
            .bind(...adapted.whereValues)
            .first(),
        ) as any;
      };

      const findMany: CustomAdapter["findMany"] = async ({
        model,
        where,
        limit,
        sortBy,
        offset,
      }: {
        model: string;
        where?: CleanedWhere[];
        limit: number;
        sortBy?: {
          field: string;
          direction: "asc" | "desc";
        };
        offset?: number;
      }) => {
        const adapted = adapt({ model, where });
        let sql = `select * from ${adapted.model}`;
        if (adapted.whereClause) sql += ` where ${adapted.whereClause}`;
        if (sortBy) sql += ` order by ${sortBy.field} ${sortBy.direction}`;
        sql += ` limit ${String(limit)}`;
        if (offset) sql += ` offset ${String(offset)}`;
        const result = await db
          .prepare(sql)
          .bind(...adapted.whereValues)
          .run();
        return result.results.map(adapted.mapResult) as any[];
      };

      const update: CustomAdapter["update"] = async ({
        model,
        where,
        update,
      }) => {
        const adapted = adapt({ model, where });
        const set = Object.keys(update as object)
          .map((k) => `${k} = ?`)
          .join(",");
        const setValues = Object.values(update as object);
        const sql = `update ${adapted.model} set ${set} ${
          adapted.whereClause ? `where ${adapted.whereClause}` : ""
        } returning *`;
        return adapted.mapResult(
          await db
            .prepare(sql)
            .bind(...setValues, ...adapted.whereValues)
            .first(),
        ) as any;
      };

      const updateMany: CustomAdapter["updateMany"] = async ({
        model,
        where,
        update,
      }) => {
        const adapted = adapt({ model, where });
        const set = Object.keys(update)
          .map((k) => `${k} = ?`)
          .join(",");
        const setValues = Object.values(update);
        const sql = `update ${adapted.model} set ${set} ${adapted.whereClause ? `where ${adapted.whereClause}` : ""}`;
        const result = await db
          .prepare(sql)
          .bind(...setValues, ...adapted.whereValues)
          .run();
        return result.meta.changes;
      };

      const del: CustomAdapter["delete"] = async ({ model, where }) => {
        const adapted = adapt({ model, where });
        const sql = `delete from ${adapted.model} ${adapted.whereClause ? `where ${adapted.whereClause}` : ""}`;
        await db
          .prepare(sql)
          .bind(...adapted.whereValues)
          .run();
      };

      const deleteMany: CustomAdapter["deleteMany"] = async ({
        model,
        where,
      }) => {
        const adapted = adapt({ model, where });
        const sql = `delete from ${adapted.model} ${adapted.whereClause ? `where ${adapted.whereClause}` : ""} returning *`;
        const result = await db
          .prepare(sql)
          .bind(...adapted.whereValues)
          .run();
        return result.results.length;
      };

      const count: CustomAdapter["count"] = async ({ model, where }) => {
        const adapted = adapt({ model, where });
        const sql = `select count(*) as count from ${adapted.model} ${adapted.whereClause ? `where ${adapted.whereClause}` : ""}`;
        const result = await db
          .prepare(sql)
          .bind(...adapted.whereValues)
          .first<number>("count");
        if (!result) {
          throw new Error(`Failed to count records in ${model}`);
        }
        return result;
      };

      return {
        create,
        findOne,
        findMany,
        update,
        updateMany,
        delete: del,
        deleteMany,
        count,
      };
    },
  });
};
