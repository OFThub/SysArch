import { ArchDocSchema, createEmptyDoc, type ArchDoc } from '../schema';
import { at, link, node } from './parts';

/**
 * A subscription web app: a load balancer in front of the web app and its
 * API; the API authenticates, keeps sessions in Redis, stores in Postgres,
 * charges through a payment provider and hands slow work to a queue that a
 * background worker drains, sending email as it goes.
 */
export function saasApp(): ArchDoc {
  const doc = createEmptyDoc('SaaS uygulaması');
  doc.meta.description =
    'Subscription web app: load-balanced web and API, auth, sessions, Postgres, payments and a queue-driven worker that sends email.';

  doc.nodes = [
    node('edge', 'gateway', 'Yük dengeleyici', { kind: 'Load balancer' }),
    node('web', 'frontend', 'Web uygulaması', { framework: 'React' }),
    node('api', 'api', 'Uygulama API', { runtime: 'Node.js', public: true }),
    node('auth', 'auth', 'Kimlik', { provider: 'Better Auth' }),
    node('sessions', 'cache', 'Oturum önbelleği', { engine: 'Redis' }),
    node('db', 'database', 'Uygulama veritabanı', { engine: 'PostgreSQL', storageGb: 50 }),
    node('jobs', 'queue', 'İş kuyruğu', { engine: 'RabbitMQ' }),
    node('worker', 'api', 'Arka plan işçisi', { runtime: 'Node.js', port: 3001 }),
    node('billing', 'external_api', 'Ödeme sağlayıcı', {
      provider: 'Stripe',
      baseUrl: 'https://api.stripe.com',
    }),
    node('mail', 'external_api', 'E-posta servisi', {
      provider: 'Postmark',
      baseUrl: 'https://api.postmarkapp.com',
    }),
  ];

  doc.edges = [
    link('e-web', 'edge', 'web', 'HTTP'),
    link('e-api', 'edge', 'api', 'HTTP'),
    link('e-auth', 'api', 'auth', 'HTTP'),
    link('e-sessions', 'api', 'sessions', 'TCP'),
    link('e-db', 'api', 'db', 'SQL'),
    link('e-enqueue', 'api', 'jobs', 'AMQP'),
    link('e-charge', 'api', 'billing', 'HTTP'),
    link('e-consume', 'worker', 'jobs', 'AMQP'),
    link('e-worker-db', 'worker', 'db', 'SQL'),
    link('e-mail', 'worker', 'mail', 'HTTP'),
  ];

  doc.flows = [{ id: 'checkout', name: 'Ödeme', steps: ['e-api', 'e-charge'], slaMs: 1000 }];

  doc.views.find((v) => v.id === 'overview')!.positions = {
    edge: at(0, 280),
    web: at(320, 80),
    api: at(320, 440),
    jobs: at(660, 160),
    db: at(660, 360),
    sessions: at(660, 560),
    auth: at(660, 760),
    worker: at(1000, 160),
    billing: at(1000, 560),
    mail: at(1340, 160),
  };

  return ArchDocSchema.parse(doc);
}
