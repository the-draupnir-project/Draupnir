// Order of import matters
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, Sampler, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { DiagConsoleLogger, DiagLogLevel, Attributes, SpanKind, diag, TextMapPropagator, Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as api from '@opentelemetry/api';

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

// Value is expected to be of form: `{trace_id}:{span_id}:{parent_id}:{flags}`
const SYNAPSE_TRACE_HEADER = "uber-trace-id";

const SYNAPSE_BAGGAGE_HEADER_PREFIX = "uberctx-";

const FIELDS = [SYNAPSE_TRACE_HEADER];

function readHeader(
    carrier: unknown,
    getter: TextMapGetter,
    key: string
): string {
    let header = getter.get(carrier, key);
    if (Array.isArray(header)) [header] = header;
    return header || '';
}

const VALID_HEADER_NAME_CHARS = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;

function isValidHeaderName(name: string): boolean {
    return VALID_HEADER_NAME_CHARS.test(name);
}

const INVALID_HEADER_VALUE_CHARS = /[^\t\x20-\x7e\x80-\xff]/;

function isValidHeaderValue(value: string): boolean {
    return !INVALID_HEADER_VALUE_CHARS.test(value);
}

class SynapseTracePropargator implements TextMapPropagator {
    inject(context: Context, carrier: any, setter: TextMapSetter<any>): void {
        const spanContext = api.trace.getSpan(context)?.spanContext();
        if (!spanContext || !api.isSpanContextValid(spanContext)) return;

        setter.set(carrier, SYNAPSE_TRACE_HEADER, `${spanContext.traceId}:${spanContext.spanId}:0:${spanContext.traceFlags}`);
        const baggage = api.propagation.getBaggage(context);
        if (!baggage) return;
        baggage.getAllEntries().forEach(([k, v]) => {
            if (!isValidHeaderName(k) || !isValidHeaderValue(v.value)) return;
            setter.set(carrier, `${SYNAPSE_BAGGAGE_HEADER_PREFIX}${k}`, v.value);
        });
    }
    extract(context: Context, carrier: any, getter: TextMapGetter<any>): Context {
        const header = readHeader(carrier, getter, SYNAPSE_TRACE_HEADER);
        if (header.split(':').length - 1 !== 4) {
            return context;
        }
        const trace_data = readHeader(carrier, getter, SYNAPSE_TRACE_HEADER).split(':');
        const traceId = trace_data[0];
        const spanId = trace_data[1];
        let parentId: string | null = trace_data[1];
        if (parentId === "0") {
            parentId = null;
        }
        const traceFlags = Number(trace_data[2]);

        context = api.trace.setSpan(
            context,
            api.trace.wrapSpanContext({
                traceId,
                spanId,
                isRemote: true,
                traceFlags,
            })
        );

        let baggage: api.Baggage =
            api.propagation.getBaggage(context) || api.propagation.createBaggage();

        getter.keys(carrier).forEach(k => {
            if (!k.startsWith(SYNAPSE_BAGGAGE_HEADER_PREFIX)) return;
            const value = readHeader(carrier, getter, k);
            baggage = baggage.setEntry(k.substr(SYNAPSE_BAGGAGE_HEADER_PREFIX.length), {
                value,
            });
        });

        if (baggage.getAllEntries().length > 0) {
            context = api.propagation.setBaggage(context, baggage);
        }


        return context;
    }
    /**
     * Note: fields does not include baggage headers as they are dependent on
     * carrier instance. Attempting to reuse a carrier by clearing fields could
     * result in a memory leak.
     */
    fields(): string[] {
        return FIELDS.slice();
    }
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
            textMapPropagator: new SynapseTracePropargator(),
            instrumentations: [getNodeAutoInstrumentations({
                // This just prints an error
                '@opentelemetry/instrumentation-grpc': {
                    enabled: false,
                },
                // This is too noisy
                '@opentelemetry/instrumentation-fs': {
                    enabled: false,
                },
                // Ignore health and metrics endpoints
                '@opentelemetry/instrumentation-http': {
                    ignoreIncomingRequestHook(req) {
                        // Ignore spans from healthz.
                        const isHealthz = !!req.url?.match(/^\/healthz$/);
                        // Ignore spans from metrics
                        const isMetrics = !!req.url?.match(/^\/metrics$/);
                        return isHealthz || isMetrics;
                    }
                }
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
