import { seraIot } from '@sysarch/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './store';

const s = () => useEditor.getState();

beforeEach(() => {
  useEditor.setState({
    doc: seraIot(),
    activeViewId: 'overview',
    selection: { nodeIds: [], edgeIds: [] },
  });
});

describe('editor store', () => {
  it('addNode places the node in the given view only and selects it', () => {
    s().addNode(
      { id: 'n1', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
      'fullstack',
      {
        x: 10,
        y: 20,
      },
    );
    const views = Object.fromEntries(s().doc.views.map((v) => [v.id, v.positions.n1]));
    expect(views).toEqual({
      fullstack: { x: 10, y: 20 },
      ai: undefined,
      hardware: undefined,
      overview: undefined,
    });
    expect(s().selection).toEqual({ nodeIds: ['n1'], edgeIds: [] });
  });

  it('updateNode merges props key by key and keeps the rest', () => {
    s().updateNode('api', { props: { port: 8080 } });
    const api = s().doc.nodes.find((n) => n.id === 'api')!;
    expect(api.props.port).toBe(8080);
    expect(api.props.runtime).toBe('Node.js');
  });

  it('updateEdge replaces pins and keeps untouched fields', () => {
    s().updateEdge('e-bme', { pins: [{ role: 'SDA', sourcePin: 'GPIO5', targetPin: 'SDA' }] });
    const e = s().doc.edges.find((x) => x.id === 'e-bme')!;
    expect(e.pins).toHaveLength(1);
    expect(e.protocol).toBe('I2C');
  });

  it('switching views clears the selection', () => {
    s().setSelection({ nodeIds: ['api'], edgeIds: [] });
    s().setActiveView('ai');
    expect(s().selection).toEqual({ nodeIds: [], edgeIds: [] });
  });
});
