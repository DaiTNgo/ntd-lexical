import {
  NodeKey,
  EditorConfig,
  LexicalNode,
  $isElementNode,
  ElementNode,
  DOMConversionMap,
  DOMConversionOutput,
  RangeSelection,
  CommandListenerPriority,
  LexicalCommand,
  createCommand,
  $getSelection,
  $setSelection,
} from 'lexical';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {addClassNamesToElement, mergeRegister} from '@lexical/utils';
import {useEffect} from 'react';

export interface Comment {
  userName: string;
  time: string;
  content: string;
}

export interface CommentInstance {
  uuid: string;
  textContent: string;
  comments: Comment[];
}

// desc: select text when we focus comment
const selectElementText = (el: EventTarget) => {
  const range = document.createRange();
  range.selectNode(el as HTMLSpanElement);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
};

class CommentNode extends ElementNode {
  __commentInstance: CommentInstance;

  static getType(): string {
    return 'comment';
  }

  static clone(node: CommentNode): CommentNode {
    return new CommentNode(node.__commentInstance, node.__key);
  }

  constructor(commentInstance: CommentInstance, key?: NodeKey) {
    super(key);
    this.__commentInstance = commentInstance;
  }

  createDOM<EditorContext>(config: EditorConfig): HTMLElement {
    const element = document.createElement('span');

    element.setAttribute(
      'data-comment-instance',
      JSON.stringify(this.__commentInstance),
    );

    element.addEventListener(
      'click',
      (e) => e.target && selectElementText(e.target),
    );

    addClassNamesToElement(element, config.theme.comment as string);

    return element;
  }

  updateDOM<EditorContext>(
    prevNode: CommentNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const commentSpan: HTMLSpanElement = dom;
    const [prevInstance, currentInstance] = [
      JSON.stringify(prevNode.__commentInstance),
      JSON.stringify(this.__commentInstance),
    ];

    if (prevInstance !== currentInstance)
      commentSpan.setAttribute('data-comment-instance', currentInstance);

    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      // @ts-ignore
      span: (node: Node) => ({
        conversion: () => {}, // convertCommentSpan,
        priority: 1,
      }),
    };
  }

  getComment(): CommentInstance {
    const self = this.getLatest();
    return (self as CommentNode).__commentInstance;
  }

  setComment(commentInstance: CommentInstance): void {
    const writable = this.getWritable();

    console.log('[setComment, writable]', {writable});
    (writable as CommentNode).__commentInstance = commentInstance;
  }

  insertNewAfter(selection: RangeSelection): null | ElementNode {
    const element = this.getParentOrThrow().insertNewAfter(selection);
    console.log('[insertNewAfter, element]', element);
    if ($isElementNode(element)) {
      const commentNode = $createCommentNode(this.__commentInstance);

      (element as ElementNode)?.append(commentNode);

      return commentNode;
    }

    return null;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  canBeEmpty(): false {
    return false;
  }

  isInline(): true {
    return true;
  }
}

function convertCommentSpan(domNode: Node): DOMConversionOutput {
  let node = null;

  if (domNode instanceof HTMLSpanElement) {
    const commentInstance = domNode.getAttribute('data-comment-instance');

    if (commentInstance) {
      const jsonCommentInstance = JSON.parse(commentInstance as string);

      node = $createCommentNode(jsonCommentInstance);
    }
  }

  return {node};
}

function $createCommentNode(commentInstance: CommentInstance): CommentNode {
  return new CommentNode(commentInstance);
}

function $isCommentNode(node: LexicalNode): boolean {
  return node instanceof CommentNode;
}

const UPDATE_COMMENT_COMMAND: LexicalCommand<CommentInstance | null> =
  createCommand();

const SET_COMMENT_COMMAND: LexicalCommand<CommentInstance | null> =
  createCommand();

const EditorPriority: CommandListenerPriority = 0;

function setCommentInstance(commentInstance: CommentInstance | null) {
  const selection = $getSelection();

  if (selection !== null) $setSelection(selection);

  const sel = $getSelection();

  // IT should look like this
  // TODO: figure out what could be solution of the problem that occur when sel.getTextContent() is included
  // if (sel !== null && sel.getTextContent()) {

  if (sel !== null) {
    console.log('[setCommentInstance, sel]', {sel, commentInstance});
    const nodes = sel.extract();

    console.log('nodes', {nodes});

    console.log('[nodes]', nodes);
    if (commentInstance === null) {
      console.log('[commentInstance === null]');
      // Remove CommentNodes
      nodes.forEach((node) => {
        const parent = node.getParent();

        if (parent && $isCommentNode(parent)) {
          const children = parent.getChildren();

          for (let i = 0; i < children.length; i += 1)
            parent.insertBefore(children[i]);

          parent.remove();
        }
      });
    } else {
      console.log('[commentInstance !== null]');
      // Add or merge CommentNodes
      if (nodes.length === 1) {
        const firstNode = nodes[0];

        // if the first node is a CommentNode or if its
        // parent is a CommentNode, we update the commentInstance.

        if ($isCommentNode(firstNode)) {
          console.log('isCommentNode == true');
          (firstNode as CommentNode).setComment(commentInstance);
          return;
        } else {
          console.log('isCommentNode == false');

          const parent = firstNode.getParent();

          if (parent && $isCommentNode(parent)) {
            console.log('parent && $isCommentNode(parent) == true');
            // set parent to be the current CommentNode
            // so that other nodes in the same parent
            // aren't handled separately below.
            (parent as CommentNode).setComment(commentInstance);
            return;
          }
        }
      }

      let prevParent: any = null;

      let commentNode: any = null;

      nodes.forEach((node) => {
        const parent = node.getParent();
        console.log('[setCircleColor] parent', {node, parent});

        if (
          parent === commentNode ||
          parent === null ||
          ($isElementNode(node) && !(node as ElementNode).isInline())
        ) {
          return;
        }

        if (!parent.is(prevParent)) {
          console.log('[!parent.is(prevParent)]', {parent, prevParent});
          prevParent = parent;
          commentNode = $createCommentNode(commentInstance);
          console.log('[setCircleColor] commentNode', commentNode);

          console.log('$isCommentNode(parent)', $isCommentNode(parent));
          if ($isCommentNode(parent)) {
            if (node.getPreviousSibling() === null) {
              parent.insertBefore(commentNode);
            } else {
              parent.insertAfter(commentNode);
            }
          } else {
            console.log('[node]', {node, commentNode});
            node.insertBefore(commentNode);
            // node.insertAfter(commentNode);
          }
        }

        if ($isCommentNode(node)) {
          if (commentNode !== null) {
            const children = (node as CommentNode).getChildren();

            for (let i = 0; i < children.length; i++)
              commentNode.append(children[i]);
          }

          node.remove();
          return;
        }

        if (commentNode !== null) {
          commentNode.append(node);
        }
      });
    }
  }
}

function updateCommentInstance(commentInstance: CommentInstance | null) {
  // const [editor] = useLexicalComposerContext()

  if (!commentInstance) return;

  const selection = $getSelection();

  if (selection !== null) $setSelection(selection);

  const sel = $getSelection();

  if (sel !== null) {
    const nodes = sel.extract();

    for (const node of nodes) {
      const parent = node.getParent();

      let commentNode: CommentNode | undefined = undefined;

      if (parent && $isCommentNode(parent)) commentNode = parent as CommentNode;
      else if (node && $isCommentNode(node)) commentNode = node as CommentNode;

      const foundNodeWithSameUuid =
        commentNode?.__commentInstance.uuid === commentInstance.uuid || false;

      if (foundNodeWithSameUuid) commentNode?.setComment(commentInstance);
    }
  }
}

export default function CommentPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([CommentNode])) {
      throw new Error('CommentPlugin: CommentNode not registered on editor');
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SET_COMMENT_COMMAND,
        (payload: CommentInstance) => {
          setCommentInstance(payload);
          return true;
        },
        EditorPriority,
      ),
      editor.registerCommand(
        UPDATE_COMMENT_COMMAND,
        (payload: CommentInstance) => {
          updateCommentInstance(payload);
          return true;
        },
        EditorPriority,
      ),
    );
  }, [editor]);

  return null;
}

export {
  CommentNode,
  $createCommentNode,
  $isCommentNode,
  SET_COMMENT_COMMAND,
  UPDATE_COMMENT_COMMAND,
};
