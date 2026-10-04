import type { CatalogType, FieldDef } from '../schema';

// Field builders keep the table below readable. Labels are UI text (Turkish);
// keys are the stable English identifiers exporters and rules read.
const num = (key: string, label: string, unit?: string, value?: number): FieldDef => ({
  key,
  label,
  kind: 'number',
  unit,
  default: value,
});
const text = (key: string, label: string, value?: string): FieldDef => ({
  key,
  label,
  kind: 'text',
  default: value,
});
const select = (key: string, label: string, options: string[]): FieldDef => ({
  key,
  label,
  kind: 'select',
  options,
  default: options[0],
});
const bool = (key: string, label: string, value: boolean): FieldDef => ({
  key,
  label,
  kind: 'bool',
  default: value,
});

// Shared performance fields read by the simulation.
const latency = (ms: number) => num('latencyMs', 'Gecikme', 'ms', ms);
const capacity = (rps: number) => num('capacityRps', 'Kapasite', 'istek/sn', rps);
const voltage = (v: number) => num('voltage', 'Besleme gerilimi', 'V', v);
const current = (ma: number) => num('currentMa', 'Ortalama akım', 'mA', ma);
const price = num('priceUsd', 'Birim fiyat', 'USD');
// Any I2C device, not just sensors (displays, IO expanders, radios).
const i2cAddress = text('i2cAddress', 'I2C adresi');

const HW_BUS = ['I2C', 'SPI', 'UART', 'CAN', 'GPIO', 'PWM', 'Power'] as const;

export const BUILTIN_TYPES: CatalogType[] = [
  // Full stack
  {
    type: 'frontend',
    domain: 'fullstack',
    label: 'Frontend',
    icon: 'monitor',
    fields: [
      select('framework', 'Framework', ['React', 'Vue', 'Svelte', 'Next.js', 'Diğer']),
      latency(20),
    ],
    protocols: ['HTTP', 'WebSocket'],
    exportHints: {
      dockerImage: 'nginx:alpine',
      composePorts: ['8080:80'],
      pricingKey: 'static-hosting',
      strideCategory: 'process',
    },
  },
  {
    type: 'api',
    domain: 'fullstack',
    label: 'API servisi',
    icon: 'server',
    fields: [
      select('runtime', 'Çalışma ortamı', ['Node.js', 'Python', 'Go', 'Java', 'Diğer']),
      num('port', 'Port', undefined, 3000),
      bool('requiresAuth', 'Kimlik doğrulama gerekli', true),
      bool('public', 'İnternete açık', false),
      latency(40),
      capacity(500),
    ],
    protocols: ['HTTP', 'gRPC', 'WebSocket', 'SQL', 'AMQP', 'MQTT', 'TCP'],
    exportHints: {
      dockerImage: 'node:22-alpine',
      composePorts: ['3000:3000'],
      terraformResource: { aws: 'aws_ecs_service' },
      pricingKey: 'container',
      strideCategory: 'process',
    },
  },
  {
    type: 'database',
    domain: 'fullstack',
    label: 'Veritabanı',
    icon: 'database',
    fields: [
      select('engine', 'Motor', ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite']),
      num('storageGb', 'Depolama', 'GB', 20),
      latency(5),
      capacity(2000),
    ],
    protocols: ['SQL', 'TCP'],
    exportHints: {
      dockerImage: 'postgres:17-alpine',
      composePorts: ['5432:5432'],
      terraformResource: { aws: 'aws_db_instance' },
      pricingKey: 'managed-db',
      strideCategory: 'store',
    },
  },
  {
    type: 'cache',
    domain: 'fullstack',
    label: 'Önbellek',
    icon: 'zap',
    fields: [
      select('engine', 'Motor', ['Redis', 'Valkey', 'Memcached']),
      latency(1),
      capacity(50_000),
    ],
    protocols: ['TCP'],
    exportHints: {
      dockerImage: 'redis:7-alpine',
      composePorts: ['6379:6379'],
      terraformResource: { aws: 'aws_elasticache_cluster' },
      pricingKey: 'managed-cache',
      strideCategory: 'store',
    },
  },
  {
    type: 'queue',
    domain: 'fullstack',
    label: 'Kuyruk / broker',
    icon: 'layers',
    fields: [
      select('engine', 'Motor', ['RabbitMQ', 'Mosquitto', 'Kafka', 'NATS', 'SQS']),
      latency(5),
      capacity(10_000),
    ],
    protocols: ['AMQP', 'MQTT', 'TCP'],
    exportHints: {
      dockerImage: 'rabbitmq:4-management-alpine',
      composePorts: ['5672:5672', '15672:15672'],
      terraformResource: { aws: 'aws_sqs_queue' },
      pricingKey: 'queue',
      strideCategory: 'store',
    },
  },
  {
    type: 'auth',
    domain: 'fullstack',
    label: 'Kimlik sağlayıcı',
    icon: 'key-round',
    fields: [
      select('provider', 'Sağlayıcı', ['Better Auth', 'Keycloak', 'Auth0', 'Cognito']),
      latency(30),
    ],
    protocols: ['HTTP'],
    exportHints: { dockerImage: 'quay.io/keycloak/keycloak', strideCategory: 'process' },
  },
  {
    type: 'external_api',
    domain: 'fullstack',
    label: 'Harici API',
    icon: 'globe',
    fields: [text('provider', 'Sağlayıcı'), text('baseUrl', 'Temel URL'), latency(150)],
    protocols: ['HTTP', 'gRPC', 'WebSocket'],
    exportHints: { strideCategory: 'external' },
  },
  {
    type: 'gateway',
    domain: 'fullstack',
    label: 'Ağ geçidi / CDN',
    icon: 'network',
    fields: [
      select('kind', 'Tür', ['Reverse proxy', 'API gateway', 'Load balancer', 'CDN']),
      latency(5),
      capacity(20_000),
    ],
    protocols: ['HTTP', 'WebSocket', 'gRPC'],
    exportHints: {
      dockerImage: 'nginx:alpine',
      composePorts: ['80:80'],
      terraformResource: { aws: 'aws_lb' },
      pricingKey: 'load-balancer',
      strideCategory: 'process',
    },
  },

  // AI
  {
    type: 'dataset',
    domain: 'ai',
    label: 'Veri seti',
    icon: 'table',
    fields: [
      select('format', 'Biçim', ['Parquet', 'CSV', 'JSONL', 'Görüntü', 'Ses']),
      num('sizeGb', 'Boyut', 'GB', 1),
      bool('containsPii', 'Kişisel veri içerir', false),
    ],
    protocols: ['HTTP', 'SQL'],
    exportHints: {
      terraformResource: { aws: 'aws_s3_bucket' },
      pricingKey: 'object-storage',
      strideCategory: 'store',
    },
  },
  {
    type: 'preprocessing',
    domain: 'ai',
    label: 'Ön işleme',
    icon: 'filter',
    fields: [select('framework', 'Araç', ['Pandas', 'Polars', 'Spark', 'Ray']), latency(200)],
    protocols: ['HTTP', 'SQL', 'AMQP'],
    exportHints: { dockerImage: 'python:3.13-slim', strideCategory: 'process' },
  },
  {
    type: 'training',
    domain: 'ai',
    label: 'Eğitim işi',
    icon: 'flask-conical',
    fields: [
      select('framework', 'Framework', ['PyTorch', 'JAX', 'TensorFlow']),
      select('gpu', 'GPU', ['Yok', 'T4', 'L4', 'A10G', 'A100', 'H100']),
      num('hoursPerMonth', 'Aylık süre', 'saat', 10),
    ],
    protocols: ['HTTP'],
    exportHints: {
      dockerImage: 'pytorch/pytorch',
      pricingKey: 'gpu-hour',
      strideCategory: 'process',
    },
  },
  {
    type: 'model_serving',
    domain: 'ai',
    label: 'Model sunucu',
    icon: 'box',
    fields: [
      select('framework', 'Sunucu', ['vLLM', 'Triton', 'TorchServe', 'ONNX Runtime', 'TensorRT']),
      text('model', 'Model'),
      select('gpu', 'GPU', ['Yok', 'T4', 'L4', 'A10G', 'A100', 'H100']),
      latency(80),
      capacity(20),
    ],
    protocols: ['HTTP', 'gRPC'],
    exportHints: {
      dockerImage: 'vllm/vllm-openai',
      composePorts: ['8000:8000'],
      pricingKey: 'gpu-hour',
      strideCategory: 'process',
    },
  },
  {
    type: 'llm_api',
    domain: 'ai',
    label: 'LLM API',
    icon: 'sparkles',
    fields: [
      select('provider', 'Sağlayıcı', ['Anthropic', 'OpenAI', 'Google', 'Diğer']),
      text('model', 'Model'),
      num('requestsPerDay', 'Günlük istek', 'istek', 1000),
      num('inputTokens', 'İstek başına girdi', 'token', 1000),
      num('outputTokens', 'İstek başına çıktı', 'token', 300),
      latency(1200),
    ],
    protocols: ['HTTP'],
    exportHints: { pricingKey: 'llm', strideCategory: 'external' },
  },
  {
    type: 'vector_db',
    domain: 'ai',
    label: 'Vektör veritabanı',
    icon: 'chart-scatter',
    fields: [
      select('engine', 'Motor', ['pgvector', 'Qdrant', 'Weaviate', 'Chroma', 'Pinecone']),
      num('dimensions', 'Boyut', undefined, 1024),
      latency(10),
      capacity(1000),
    ],
    protocols: ['HTTP', 'gRPC', 'SQL'],
    exportHints: {
      dockerImage: 'qdrant/qdrant',
      composePorts: ['6333:6333'],
      pricingKey: 'managed-db',
      strideCategory: 'store',
    },
  },
  {
    type: 'agent',
    domain: 'ai',
    label: 'Ajan',
    icon: 'bot',
    fields: [
      select('framework', 'Framework', ['Claude Agent SDK', 'LangGraph', 'Özel']),
      num('maxSteps', 'En fazla adım', undefined, 10),
      latency(3000),
    ],
    protocols: ['HTTP', 'WebSocket', 'gRPC'],
    exportHints: { dockerImage: 'node:22-alpine', strideCategory: 'process' },
  },
  {
    type: 'evaluation',
    domain: 'ai',
    label: 'Değerlendirme',
    icon: 'gauge',
    fields: [text('metric', 'Metrik', 'accuracy'), num('threshold', 'Eşik', undefined, 0.8)],
    protocols: ['HTTP'],
    exportHints: { strideCategory: 'process' },
  },

  // Hardware
  {
    type: 'mcu',
    domain: 'hardware',
    label: 'Mikrodenetleyici',
    icon: 'hw-mcu',
    fields: [
      select('family', 'Aile', ['ESP32', 'STM32', 'RP2040', 'nRF52', 'AVR']),
      voltage(3.3),
      current(80),
      price,
      num('clockMhz', 'Saat', 'MHz', 240),
    ],
    protocols: [...HW_BUS, 'USB', 'BLE', 'LoRa', 'MQTT', 'HTTP', 'WebSocket'],
    // No wokwiType: the board depends on the part, so presets name it.
    exportHints: { pricingKey: 'bom', strideCategory: 'process' },
  },
  {
    type: 'sbc',
    domain: 'hardware',
    label: 'Tek kart bilgisayar',
    icon: 'hw-sbc',
    fields: [
      select('os', 'İşletim sistemi', ['Raspberry Pi OS', 'Ubuntu', 'JetPack']),
      num('ramGb', 'RAM', 'GB', 8),
      voltage(5),
      current(1500),
      price,
    ],
    protocols: [...HW_BUS, 'USB', 'BLE', 'MQTT', 'HTTP', 'gRPC', 'WebSocket', 'SQL', 'TCP'],
    exportHints: { pricingKey: 'bom', strideCategory: 'process' },
  },
  {
    type: 'sensor',
    domain: 'hardware',
    label: 'Sensör',
    icon: 'hw-sensor',
    fields: [
      text('measures', 'Ölçtüğü'),
      i2cAddress,
      num('sampleRateHz', 'Örnekleme', 'Hz', 1),
      voltage(3.3),
      current(1),
      price,
    ],
    // USB: cameras, GPS and other modules that plug in rather than wire up.
    protocols: ['I2C', 'SPI', 'UART', 'GPIO', 'USB', 'Power'],
    exportHints: { pricingKey: 'bom', strideCategory: 'external' },
  },
  {
    type: 'actuator',
    domain: 'hardware',
    label: 'Eyleyici',
    icon: 'hw-actuator',
    fields: [
      select('kind', 'Tür', ['Servo', 'DC motor', 'Step motor', 'Röle', 'LED', 'Ekran', 'Buzzer']),
      i2cAddress,
      voltage(5),
      current(100),
      price,
    ],
    protocols: ['GPIO', 'PWM', 'I2C', 'Power'],
    exportHints: { pricingKey: 'bom', strideCategory: 'external' },
  },
  {
    type: 'power',
    domain: 'hardware',
    label: 'Güç kaynağı / batarya',
    icon: 'hw-power',
    fields: [
      select('kind', 'Tür', ['USB besleme', 'Batarya', 'Regülatör', 'Güneş paneli']),
      num('outputVoltage', 'Çıkış gerilimi', 'V', 5),
      num('maxCurrentMa', 'En fazla akım', 'mA', 500),
      num('capacityMah', 'Kapasite', 'mAh', 0),
      price,
    ],
    protocols: ['Power'],
    exportHints: { pricingKey: 'bom' },
  },
  {
    type: 'comm_module',
    domain: 'hardware',
    label: 'Haberleşme modülü',
    icon: 'hw-comm',
    fields: [
      select('kind', 'Tür', ['LoRa', 'LTE', 'Zigbee', 'Wi-Fi', 'BLE']),
      i2cAddress,
      voltage(3.3),
      current(40),
      price,
    ],
    protocols: ['UART', 'SPI', 'I2C', 'LoRa', 'BLE', 'MQTT', 'HTTP', 'Power'],
    exportHints: { pricingKey: 'bom', strideCategory: 'process' },
  },
];
