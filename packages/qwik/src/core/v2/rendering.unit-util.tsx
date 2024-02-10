/* eslint-disable no-console */
// TODO remove console statements
import { expect } from 'vitest';
import { Q_FUNCS_PREFIX, renderToString } from '../../server/render';
import { createDocument } from '../../testing/document';
import { getTestPlatform } from '../../testing/platform';
import { componentQrl } from '../component/component.public';
import { getPlatform, setPlatform } from '../platform/platform';
import { inlinedQrl } from '../qrl/qrl';
import type { QRL } from '../qrl/qrl.public';
import { ERROR_CONTEXT } from '../render/error-handling';
import { Slot } from '../render/jsx/slot.public';
import type { JSXOutput } from '../render/jsx/types/jsx-node';
import { useContextProvider } from '../use/use-context';
import { OnRenderProp } from '../util/markers';
import { DomContainer, getDomContainer } from './client/dom-container';
import { render2 } from './client/render2';
import type { ContainerElement, VNode, VirtualVNode } from './client/types';
import {
  vnode_getAttr,
  vnode_getFirstChild,
  vnode_getParent,
  vnode_getVNodeForChildNode,
  vnode_locate,
  vnode_toString,
} from './client/vnode';
import { codeToName } from './shared-serialization';
import { ssrCreateContainer } from './ssr/ssr-container';
import { ssrRenderToContainer } from './ssr/ssr-render';
import './vdom-diff.unit-util';

export async function domRender(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    /// Use old SSR rendering ond print out debug state. Useful for comparing difference between serialization.
    oldSSR?: boolean;
  } = {}
) {
  const document = createDocument();
  await render2(document.body, jsx);
  await getTestPlatform().flush();
  const container = getDomContainer(document.body);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- CSR --------------------------');
    console.log(container.rootVNode.toString());
    console.log('--------------------------------------------------------');
  }
  return {
    document,
    container,
    vNode: vnode_getFirstChild(container.rootVNode),
  };
}

export async function ssrRenderToDom(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    /// Use old SSR rendering ond print out debug state. Useful for comparing difference between serialization.
    oldSSR?: boolean;
  } = {}
) {
  if (opts.oldSSR) {
    const platform = getPlatform();
    try {
      const ssr = await renderToString([
        <head>
          <title>{expect.getState().testPath}</title>
        </head>,
        <body>{jsx}</body>,
      ]);
      // restore platform
      console.log('LEGACY HTML', ssr.html);
    } finally {
      setPlatform(platform);
    }
  }
  const ssrContainer = ssrCreateContainer({ tagName: 'html' });
  await ssrRenderToContainer(ssrContainer, [
    <head>
      <title>{expect.getState().testPath}</title>
    </head>,
    <body>{jsx}</body>,
  ]);
  const html = ssrContainer.writer.toString();
  const document = createDocument({ html });
  const qFuncs = document.body.querySelector('[q\\:func]');
  const containerElement = document.body.parentElement as ContainerElement;
  if (qFuncs) {
    let code = qFuncs.textContent || '';
    code = code.replace(Q_FUNCS_PREFIX, '');
    if (code) {
      containerElement.qFuncs = eval(code);
    }
  }
  const container = getDomContainer(containerElement) as DomContainer;
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- SSR --------------------------');
    console.log(html);
    console.log('--------------------------------------------------------');
    console.log(vnode_toString.call(container.rootVNode, Number.MAX_SAFE_INTEGER, '', true));
    console.log('------------------- SERIALIZED STATE -------------------');
    const state = container.$rawStateData$;
    for (let i = 0; i < state.length; i++) {
      console.log(('    ' + i + ':').substr(-4), qwikJsonStringify(state[i]));
    }
    const funcs = container.$qFuncs$;
    for (let i = 0; i < funcs.length; i++) {
      console.log(('    ' + i + ':').substr(-4), qwikJsonStringify(funcs[i].toString()));
    }
    if (false as boolean) {
      // stateDate is private but it's not enforced so we can access it for the test
      const proxyState = (container as any).stateData;
      for (let i = 0; i < state.length; i++) {
        console.log(('    ' + i + ':').substr(-4), proxyState[i]);
      }
    }
    console.log('--------------------------------------------------------');
  }
  const bodyVNode = vnode_getVNodeForChildNode(container.rootVNode, document.body);
  return { container, document, vNode: vnode_getFirstChild(bodyVNode) };
}

export async function rerenderComponent(element: HTMLElement) {
  const container = getDomContainer(element);
  const vElement = vnode_locate(container.rootVNode, element);
  const host = getHostVNode(vElement)!;
  const qrl = container.getHostProp<QRL<any>>(host, OnRenderProp);
  const props = container.getHostProp(host, 'props');
  container.$scheduler$.$scheduleComponent$(host, qrl, props);
}

function getHostVNode(vElement: VNode | null) {
  while (vElement != null) {
    if (typeof vnode_getAttr(vElement, OnRenderProp) == 'string') {
      return vElement as VirtualVNode;
    }
    vElement = vnode_getParent(vElement);
  }
  return vElement;
}

function qwikJsonStringify(value: any): string {
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  let json = JSON.stringify(value);
  json = json.replace(/"\\u00([0-9a-f][0-9a-f])/gm, (_, value) => {
    return '"' + RED + codeToName(parseInt(value, 16)) + ': ' + RESET;
  });
  return json;
}

export const ErrorProvider = Object.assign(
  componentQrl(
    inlinedQrl(() => {
      (ErrorProvider as any).error = null;
      useContextProvider(ERROR_CONTEXT, ErrorProvider as any);
      return <Slot />;
    }, 's_ErrorProvider')
  ),
  { error: null as any }
);
