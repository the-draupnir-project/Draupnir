// Order of import matters
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, Sampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { DiagConsoleLogger, DiagLogLevel, Attributes, SpanKind, diag } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

/**
 * This starts instrumentation for the app
 */
if (process.env.TRACING_ENABLED) {
    if (process.env.TRACING_DIAG_ENABLED) {
        if (process.env.TRACING_DIAG_DEBUG) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
        } else if (process.env.TRACING_DIAG_VERBOSE) {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);
        } else {
            diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
        }
    }
    console.info("Preparing tracing");

    type FilterFunction = (spanName: string, spanKind: SpanKind, attributes: Attributes) => boolean;

    function filterSampler(filterFn: FilterFunction, parent: Sampler): Sampler {
        return {
            shouldSample(ctx, tid, spanName, spanKind, attr, links) {
                if (!filterFn(spanName, spanKind, attr)) {
                    return { decision: SamplingDecision.NOT_RECORD };
                }
                return parent.shouldSample(ctx, tid, spanName, spanKind, attr, links);
            },
            toString() {
                return `FilterSampler(${parent.toString()})`;
            }
        }
    }

    function ignoreHealthCheck(spanName: string, spanKind: SpanKind, attributes: Attributes) {
        return spanKind !== SpanKind.SERVER || attributes[SemanticAttributes.HTTP_ROUTE] !== "/healthz" || attributes[SemanticAttributes.HTTP_ROUTE] !== "/metrics";
    }

    if (process.env.TRACING_TRACE_URL === undefined || process.env.TRACING_TRACE_URL === "") {
        console.error("Unable to start tracing without the env variable `TRACING_TRACE_URL` being set. Check https://opentelemetry.io/docs/instrumentation/js/exporters/ for more infomration.");
        process.exit(1);
    }
    console.info(`Starting tracing and pushing to ${process.env.TRACING_TRACE_URL}`);

    const exporter = new OTLPTraceExporter({
        //url: "<your-otlp-endpoint>/v1/traces",
        url: process.env.TRACING_TRACE_URL
    });

    const sdk = new NodeSDK({
        sampler: filterSampler(ignoreHealthCheck, new AlwaysOnSampler()),
        traceExporter: exporter,
        serviceName: "Draupnir-Appservice",
        instrumentations: [getNodeAutoInstrumentations({
            // This just prints an error
            '@opentelemetry/instrumentation-grpc': {
                enabled: false,
            },
            // This is too noisy
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
        })]
    });

    sdk.start();
    console.info("Started tracing");
} else {
    console.warn("Running without tracing");
}

import { Cli } from "matrix-appservice-bridge";
import { MjolnirAppService } from "./AppService";
import { IConfig } from "./config/config";

/**
 * This file provides the entrypoint for the appservice mode for mjolnir.
 * A registration file can be generated `ts-node src/appservice/cli.ts -r -u "http://host.docker.internal:9000"`
 * and the appservice can be started with `ts-node src/appservice/cli -p 9000 -c your-confg.yaml`.
 */
const cli = new Cli({
    registrationPath: "mjolnir-registration.yaml",
    bridgeConfig: {
        schema: {},
        affectsRegistration: false,
        defaults: {}
    },
    generateRegistration: MjolnirAppService.generateRegistration,
    run: async function (port: number) {
        const config: IConfig | null = cli.getConfig() as any;
        if (config === null) {
            throw new Error("Couldn't load config");
        }
        await MjolnirAppService.run(port, config, cli.getRegistrationFilePath());
    }
});
console.log("Starting to run appservice");

cli.run();
