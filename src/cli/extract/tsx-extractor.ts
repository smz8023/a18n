import traverse from '@babel/traverse'
import * as t from '@babel/types'
import { Context, SourceText, SourceTextWithContext } from '../../types'
import { LIB_IDENTIFIER } from '../constants'
import { parse } from '../util/ast'
import { readFile } from '../util/file'

const fromStringLiteral = (
  node: object | null | undefined,
): undefined | string => {
  if (!node) return undefined
  if (t.isStringLiteral(node)) {
    return node.value
  } else {
    return undefined
  }
}

export const toStaticText = (
  node: t.Node,
  text: string,
  filePath: string,
  lines: string[],
): SourceTextWithContext => {
  const loc = node.loc
  const line = loc ? loc.start.line : undefined
  const column = loc ? loc.start.column : undefined
  return {
    type: 'string',
    text: text,
    context: {
      path: filePath,
      line,
      column,
      text: loc ? lines[loc.start.line] : undefined,
    },
  }
}
export const toDynamicText = (
  node: t.Node,
  parts: string[],
  filePath: string,
  lines: string[],
): SourceTextWithContext => {
  const loc = node.loc
  const line = loc ? loc.start.line : undefined
  const column = loc ? loc.start.column : undefined
  return {
    type: 'interpolated',
    textParts: parts,
    context: {
      path: filePath,
      line,
      column,
      text: loc ? lines[loc.start.line] : undefined,
    },
  }
}

export const extractCode = (
  code: string,
  filePath: string,
): (SourceText & { context: Context })[] => {
  let sourceTexts = [] as SourceTextWithContext[]

  const ast = parse(code)
  const lines = code.split('\n')

  const addStaticText = (node: t.Node, text: string): void => {
    sourceTexts.push(toStaticText(node, text, filePath, lines))
  }
  const addDynamicText = (node: t.Node, parts: string[]) => {
    sourceTexts.push(toDynamicText(node, parts, filePath, lines))
  }

  const invariant = (condition: any, node: t.Node, message: string) => {
    if (!condition) {
      throw new Error(
        `${filePath}${
          node.loc
            ? ':' + node.loc.start.line + ':' + node.loc.start.column
            : ''
        }` +
          ' ' +
          message,
      )
    }
  }

  traverse(ast, {
    enter(path) {
      const node = path.node

      switch (node.type) {
        case 'CallExpression': {
          if (
            t.isIdentifier(node.callee) &&
            node.callee.name === LIB_IDENTIFIER
          ) {
            switch (node.arguments.length) {
              case 1: {
                const arg0 = node.arguments[0]
                const text = fromStringLiteral(arg0)
                invariant(
                  text != null,
                  node,
                  `${LIB_IDENTIFIER}() has signature: a18n(text:string), instead received: ${node.arguments.map(
                    (a) => a.type,
                  )}`,
                )
                addStaticText(node, text!)
                break
              }
              default: {
                invariant(
                  false,
                  node,
                  `export ${LIB_IDENTIFIER}() has signature: a18n(text:string), instead received: ${node.arguments.map(
                    (a) => a.type,
                  )}`,
                )
              }
            }
          }
          break
        }

        case 'TaggedTemplateExpression': {
          const {
            tag,
            quasi: { quasis = [] },
          } = node
          if (t.isIdentifier(tag) && tag.name === LIB_IDENTIFIER) {
            addDynamicText(
              node,
              quasis.map((q) => q.value.raw),
            )
          }
          break
        }

        default:
          break
      }
    },
  })

  return sourceTexts
}

export const extractFile = (filePath: string) => {
  try {
    const content = readFile(filePath)
    const sourceTexts = extractCode(content, filePath)
    return {
      ok: true,
      sourceTexts,
    }
  } catch (error) {
    const loc = error?.loc
    if (loc) {
      console.error(
        `[a18n] error processing: ${filePath}:${loc.line}:${loc.column}`,
      )
    } else {
      console.error(`[a18n] error processing: ${filePath}`)
    }
    console.error(error)
    return {
      ok: false,
    }
  }
}
