/**
 * This file exists as a way to register all protections.
 * In future, we should maybe try to dogfood the dynamic plugin load sytem
 * instead. For now that system doesn't even exist.
 */

// keep alphabetical please.
import './BanPropagation';
import './BasicFlooding';
import './FirstMessageIsImage';
import './JoinWaveShortCircuit';
import './MessageIsMedia';
import './MessageIsVoice';
import './TrustedReporters';
import './WordList';

// import capability renderers and glue too.
import "../capabilities/capabilityIndex";
