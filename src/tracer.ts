// Order of import matters
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, Sampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { DiagConsoleLogger, DiagLogLevel, Attributes, SpanKind, diag } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';

export enum DRAUPNIR_SYSTEM_TYPES {
    APPSERVICE = "appservice",
    BOT = "bot"
}

export enum DRAUPNIR_RESULT {
    SUCCESS = "success",
    FAILURE = "failure"
}

export enum DRAUPNIR_TRACING_ATTRIBUTES {
    SYSTEM = "draupnir.system",
    PROVISION_OUTCOME = "draupnir.provision.outcome"
}

export default function initTracer(serviceName: string) {
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
                    if (filterFn(spanName, spanKind, attr)) {
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
            return attributes[SemanticAttributes.HTTP_ROUTE] === "/healthz" || attributes[SemanticAttributes.HTTP_ROUTE] === "/metrics";
        }

        if (process.env.TRACING_TRACE_URL === undefined || process.env.TRACING_TRACE_URL === "") {
            console.error("Unable to start tracing without the env variable `TRACING_TRACE_URL` being set. Check https://opentelemetry.io/docs/instrumentation/js/exporters/ for more infomration.");
            process.exit(1);
        }
        if (process.env.TRACING_METRIC_URL === undefined || process.env.TRACING_METRIC_URL === "") {
            console.error("Unable to start tracing without the env variable `TRACING_METRIC_URL` being set. Check https://opentelemetry.io/docs/instrumentation/js/exporters/ for more infomration.");
            process.exit(1);
        }
        console.info(`Starting tracing and pushing to ${process.env.TRACING_TRACE_URL}`);

        const exporter = new OTLPTraceExporter({
            //url: "<your-otlp-endpoint>/v1/traces",
            url: process.env.TRACING_TRACE_URL
        });
        // const metrics_exporter = new OTLPMetricExporter({
        //     //url: "<your-otlp-endpoint>/v1/metrics",
        //     url: process.env.TRACING_METRIC_URL
        // });

        const sdk = new NodeSDK({
            sampler: filterSampler(ignoreHealthCheck, new AlwaysOnSampler()),
            traceExporter: exporter,
            // Broken
            // metricReader: new PeriodicExportingMetricReader({
            //     exporter: metrics_exporter
            // }),
            serviceName: serviceName,
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

        // Gracefully shut down sdk
        process.on('SIGTERM', () => {
            sdk
                .shutdown()
                .then(
                    () => console.log('Tracing SDK shut down successfully'),
                    (err) => console.log('Error shutting down Tracing SDK', err)
                )
                .finally(() => process.exit(0))
        })
        console.info("Started tracing");
    } else {
        console.warn("Running without tracing");
    }

}
