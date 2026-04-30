// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  TSchema,
  StaticDecode,
  TypeBoxError,
  Static,
  StaticEncode,
} from "@sinclair/typebox";
import {
  TypeCheck,
  TypeCompiler,
  ValueError,
  ValueErrorIterator,
} from "@sinclair/typebox/compiler";
import { ActionResult, Ok, ResultError } from "./Action";
import {
  ActionException,
  ActionExceptionKind,
  assertThrowableIsError,
} from "./ActionException";
import { Logger } from "../Logging/Logger";

export class DecodeException extends ActionException {
  private static log = new Logger("DecodeException");
  constructor(
    message: string,
    exception: Error,
    public readonly errors: ValueError[],
    suppressLog?: boolean
  ) {
    super(ActionExceptionKind.Unknown, exception, message, {
      suppressLog: suppressLog ?? false,
    });
    if (!suppressLog) {
      DecodeException.log.error(this.uuid, ...this.errors);
    }
  }
}

export class Value {
  private static compiledSchema = new Map<TSchema, TypeCheck<TSchema>>();
  public static Compile<T extends TSchema>(schema: T): TypeCheck<T> {
    const entry = this.compiledSchema.get(schema);
    if (entry === undefined) {
      const compiledCheck = TypeCompiler.Compile(schema);
      this.compiledSchema.set(
        schema,
        compiledCheck as unknown as TypeCheck<TSchema>
      );
      return compiledCheck;
    }
    return entry as unknown as TypeCheck<T>;
  }
  public static Decode<T extends TSchema, D = StaticDecode<T>>(
    schema: T,
    value: unknown,
    { suppressLogOnError }: { suppressLogOnError?: boolean } = {}
  ): ActionResult<D, DecodeException> {
    const decoder = this.Compile(schema);
    try {
      return Ok(decoder.Decode(value));
    } catch (e) {
      if (e instanceof TypeBoxError) {
        const errors = [...decoder.Errors(value)];
        return ResultError(
          new DecodeException(
            "Unable to decode an event",
            e,
            errors,
            suppressLogOnError
          )
        );
      } else {
        throw e;
      }
    }
  }
  public static Check<T extends TSchema>(
    schema: T,
    value: unknown
  ): value is Static<T> {
    const decoder = this.Compile(schema);
    return decoder.Check(value);
  }
  public static Encode<T extends TSchema>(
    schema: T,
    value: StaticDecode<T>
  ): ActionResult<StaticEncode<T>> {
    return this.resultify<T, StaticEncode<T>>(schema, (encoder) =>
      encoder.Encode(value)
    );
  }
  public static Errors<T extends TSchema>(
    schema: T,
    value: unknown
  ): ValueErrorIterator {
    const decoder = this.Compile(schema);
    return decoder.Errors(value);
  }
  private static resultify<T extends TSchema, R>(
    schema: T,
    continuation: (decoder: TypeCheck<T>) => R
  ): ActionResult<R> {
    try {
      const decoder = this.Compile(schema);
      return Ok(continuation(decoder));
    } catch (e) {
      if (!(e instanceof TypeBoxError)) {
        throw e;
      } else {
        return ActionException.Result(`Unable to decode schema from value`, {
          exception: assertThrowableIsError(e),
          exceptionKind: ActionExceptionKind.Unknown,
        });
      }
    }
  }
}
