import { seraIot } from '@sysarch/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { undo, useEditor } from './store';

const s = () => useEditor.getState();
const history = () => useEditor.temporal.getState();

beforeEach(() => {
  useEditor.setState({
    doc: seraIot(),
    activeViewId: 'overview',
    selection: { nodeIds: [], edgeIds: [] },
  });
  history().clear();
});

describe('undo history', () => {
  it('restores a deleted node together with its edges', () => {
    const before = s().doc;
    s().deleteElements(['db'], []);
    expect(s().doc.edges.some((e) => e.target === 'db' || e.source === 'db')).toBe(false);
    undo();
    expect(s().doc).toEqual(before);
  });

  it('groups consecutive edits of one field into a single step', () => {
    s().updateNode('api', { label: 'S' });
    s().updateNode('api', { label: 'Se' });
    s().updateNode('api', { label: 'Ser' });
    expect(history().pastStates).toHaveLength(1);
    undo();
    expect(s().doc.nodes.find((n) => n.id === 'api')!.label).toBe('Sera API');
  });

  it('keeps discrete actions as separate steps', () => {
    s().updateNode('api', { label: 'Gateway' });
    s().addNode(
      { id: 'n1', domain: 'fullstack', type: 'cache', label: 'Redis', props: {} },
      'fullstack',
      {
        x: 0,
        y: 0,
      },
    );
    undo();
    expect(s().doc.nodes.some((n) => n.id === 'n1')).toBe(false);
    expect(s().doc.nodes.find((n) => n.id === 'api')!.label).toBe('Gateway');
  });

  it('does not record selection or view changes', () => {
    s().setSelection({ nodeIds: ['api'], edgeIds: [] });
    s().setActiveView('ai');
    expect(history().pastStates).toHaveLength(0);
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
