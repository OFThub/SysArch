import { ArchDocSchema, createEmptyDoc, type ArchDoc } from '../schema';
import { at, link, node, part } from './parts';

/**
 * Object detection at the edge: a USB camera on a Jetson that runs the
 * detector locally and publishes events over MQTT; a backend stores them for
 * a monitoring panel and collects hard frames into a dataset that retrains
 * the detector, which is deployed back to the device.
 */
export function edgeVision(): ArchDoc {
  const doc = createEmptyDoc('Uç yapay zeka kamerası');
  doc.meta.description =
    'Edge object detection: a Jetson runs the detector on camera frames and publishes events; hard frames feed retraining.';

  doc.nodes = [
    node('camera', 'sensor', 'USB kamera', {
      measures: 'görüntü',
      sampleRateHz: 30,
      voltage: 5,
      currentMa: 250,
      priceUsd: 25,
    }),
    part('jetson', 'jetson-orin-nano'),
    {
      ...node('detector', 'model_serving', 'Nesne algılama', {
        framework: 'TensorRT',
        model: 'yolo11n',
        latencyMs: 25,
        capacityRps: 30,
      }),
      deploy: { target: 'edge' },
    },
    node('broker', 'queue', 'MQTT broker', { engine: 'Mosquitto' }),
    node('api', 'api', 'Olay API'),
    node('db', 'database', 'Olay kayıtları', { engine: 'PostgreSQL' }),
    node('panel', 'frontend', 'İzleme paneli'),
    node('frames', 'dataset', 'Zor kareler', { format: 'Görüntü', sizeGb: 40 }),
    node('train', 'training', 'Model eğitimi', { gpu: 'L4', hoursPerMonth: 20 }),
  ];

  doc.edges = [
    link('e-camera', 'camera', 'jetson', 'USB'),
    link('e-infer', 'jetson', 'detector', 'gRPC'),
    link('e-publish', 'jetson', 'broker', 'MQTT'),
    link('e-subscribe', 'api', 'broker', 'MQTT'),
    link('e-store', 'api', 'db', 'SQL'),
    link('e-panel', 'panel', 'api', 'HTTP'),
    link('e-collect', 'api', 'frames', 'HTTP'),
    link('e-train', 'frames', 'train', 'HTTP'),
    link('e-deploy', 'train', 'detector', 'HTTP'),
  ];

  doc.flows = [
    {
      id: 'event',
      name: 'Algılama olayı',
      steps: ['e-camera', 'e-publish', 'e-subscribe', 'e-store'],
      slaMs: 250,
    },
  ];

  doc.views.find((v) => v.id === 'overview')!.positions = {
    camera: at(0, 200),
    jetson: at(300, 200),
    detector: at(660, 0),
    broker: at(660, 320),
    api: at(1000, 320),
    db: at(1340, 200),
    panel: at(1340, 440),
    frames: at(1000, 0),
    train: at(1340, -80),
  };

  return ArchDocSchema.parse(doc);
}
