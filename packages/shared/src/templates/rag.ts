import { ArchDocSchema, createEmptyDoc, type ArchDoc } from '../schema';
import { at, link, node } from './parts';

/**
 * Retrieval-augmented chat: an API answers questions with an LLM, grounded
 * in document chunks it finds by embedding the question; an ingestion path
 * chunks and embeds the sources ahead of time, and an evaluation job scores
 * answers for faithfulness.
 */
export function ragApp(): ArchDoc {
  const doc = createEmptyDoc('RAG uygulaması');
  doc.meta.description =
    'Retrieval-augmented chat: answers grounded in embedded document chunks, with offline ingestion and answer evaluation.';

  doc.nodes = [
    node('web', 'frontend', 'Sohbet arayüzü', { framework: 'Next.js' }),
    node('api', 'api', 'Sohbet API', { runtime: 'Python', port: 8000, public: true }),
    node('cache', 'cache', 'Yanıt önbelleği', { engine: 'Redis' }),
    node('history', 'database', 'Sohbet geçmişi', { engine: 'PostgreSQL' }),
    node('embed', 'model_serving', 'Gömme modeli', {
      framework: 'TorchServe',
      model: 'bge-m3',
      gpu: 'L4',
      latencyMs: 30,
    }),
    node('vectors', 'vector_db', 'Belge vektörleri', { engine: 'Qdrant', dimensions: 1024 }),
    node('llm', 'llm_api', 'Yanıt modeli', {
      provider: 'Anthropic',
      model: 'claude-sonnet-5-5',
      requestsPerDay: 5000,
      inputTokens: 6000,
      outputTokens: 500,
    }),
    node('docs', 'dataset', 'Kaynak belgeler', { format: 'JSONL', sizeGb: 5 }),
    node('ingest', 'preprocessing', 'Parçalama', { framework: 'Ray' }),
    node('evals', 'evaluation', 'Yanıt değerlendirme', { metric: 'faithfulness', threshold: 0.85 }),
  ];

  doc.edges = [
    link('e-ask', 'web', 'api', 'HTTP'),
    link('e-cache', 'api', 'cache', 'TCP'),
    link('e-history', 'api', 'history', 'SQL'),
    link('e-embed-query', 'api', 'embed', 'HTTP'),
    link('e-search', 'api', 'vectors', 'gRPC'),
    link('e-answer', 'api', 'llm', 'HTTP'),
    link('e-ingest', 'docs', 'ingest', 'HTTP'),
    link('e-embed-docs', 'ingest', 'embed', 'HTTP'),
    link('e-index', 'ingest', 'vectors', 'HTTP'),
    link('e-eval', 'evals', 'api', 'HTTP'),
  ];

  doc.flows = [
    { id: 'answer', name: 'Soru yanıtlama', steps: ['e-ask', 'e-answer'], slaMs: 3000 },
    { id: 'ingestion', name: 'Belge alma', steps: ['e-ingest', 'e-embed-docs'] },
  ];

  doc.views.find((v) => v.id === 'overview')!.positions = {
    web: at(0, 240),
    api: at(320, 240),
    evals: at(320, 520),
    cache: at(660, 80),
    history: at(660, 400),
    embed: at(1000, 160),
    llm: at(1000, 440),
    vectors: at(1340, 300),
    ingest: at(1340, 0),
    docs: at(1680, 0),
  };

  return ArchDocSchema.parse(doc);
}
