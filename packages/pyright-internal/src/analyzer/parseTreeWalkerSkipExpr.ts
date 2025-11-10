/*
 * parseTreeWalkerSkipExpr.ts
 * Author: Doug Hoskisson
 *
 * like parseTreeWalker.ts
 * except it skips expressions,
 * so it's faster for finding things that can't be inside expressions
 * (like a class or a (non-lambda) function)
 */

import {
    CaseNode,
    ClassNode,
    ExceptNode,
    ForNode,
    FunctionNode,
    IfNode,
    MatchNode,
    ModuleNode,
    ParseNode,
    ParseNodeArray,
    ParseNodeType,
    StatementListNode,
    SuiteNode,
    TryNode,
    WhileNode,
    WithNode,
} from '../parser/parseNodes';

/** only child nodes with suites */
export function getChildNodesSkipExpr(node: ParseNode): (ParseNode | undefined)[] {
    switch (node.nodeType) {
        case ParseNodeType.Case:
            return [/* node.d.pattern, node.d.guardExpr, */ node.d.suite];

        case ParseNodeType.Class:
            return [/* ...node.d.decorators, node.d.name, node.d.typeParams, ...node.d.arguments, */ node.d.suite];

        case ParseNodeType.If:
            return [/* node.d.testExpr, */ node.d.ifSuite, node.d.elseSuite];

        case ParseNodeType.Except:
            return [/* node.d.typeExpr, node.d.name, */ node.d.exceptSuite];

        case ParseNodeType.For:
            return [/* node.d.targetExpr, node.d.iterableExpr, */ node.d.forSuite, node.d.elseSuite];

        case ParseNodeType.Function:
            return [
                /*
                ...node.d.decorators,
                node.d.name,
                node.d.typeParams,
                ...node.d.params,
                node.d.returnAnnotation,
                node.d.funcAnnotationComment,
                */
                node.d.suite,
            ];

        case ParseNodeType.Match:
            return [/* node.d.expr, */ ...node.d.cases];

        case ParseNodeType.Module:
            return [...node.d.statements];

        case ParseNodeType.StatementList:
            return node.d.statements;

        case ParseNodeType.Suite:
            return [...node.d.statements];

        case ParseNodeType.Try:
            return [node.d.trySuite, ...node.d.exceptClauses, node.d.elseSuite, node.d.finallySuite];

        case ParseNodeType.While:
            return [/* node.d.testExpr, */ node.d.whileSuite, node.d.elseSuite];

        case ParseNodeType.With:
            return [/* ...node.d.withItems, */ node.d.suite];

        default:
            return [];
    }
}

// To use this class, create a subclass and override the
// visitXXX methods that you want to handle.
export class ParseTreeVisitorSkipExpr<T> {
    constructor(private readonly _default: T) {
        // empty
    }

    visit(node: ParseNode): T {
        switch (node.nodeType) {
            case ParseNodeType.Case:
                return this.visitCase(node);

            case ParseNodeType.Class:
                return this.visitClass(node);

            case ParseNodeType.If:
                return this.visitIf(node);

            case ParseNodeType.Except:
                return this.visitExcept(node);

            case ParseNodeType.For:
                return this.visitFor(node);

            case ParseNodeType.Function:
                return this.visitFunction(node);

            case ParseNodeType.Match:
                return this.visitMatch(node);

            case ParseNodeType.Module:
                return this.visitModule(node);

            case ParseNodeType.StatementList:
                return this.visitStatementList(node);

            case ParseNodeType.Suite:
                return this.visitSuite(node);

            case ParseNodeType.Try:
                return this.visitTry(node);

            case ParseNodeType.While:
                return this.visitWhile(node);

            case ParseNodeType.With:
                return this.visitWith(node);

            default:
                return this._default;
        }
    }

    visitCase(node: CaseNode) {
        return this._default;
    }

    visitClass(node: ClassNode) {
        return this._default;
    }

    visitIf(node: IfNode) {
        return this._default;
    }

    visitExcept(node: ExceptNode) {
        return this._default;
    }

    visitFor(node: ForNode) {
        return this._default;
    }

    visitFunction(node: FunctionNode) {
        return this._default;
    }

    visitMatch(node: MatchNode) {
        return this._default;
    }

    visitModule(node: ModuleNode) {
        return this._default;
    }

    visitStatementList(node: StatementListNode) {
        return this._default;
    }

    visitSuite(node: SuiteNode) {
        return this._default;
    }

    visitTry(node: TryNode) {
        return this._default;
    }

    visitWhile(node: WhileNode) {
        return this._default;
    }

    visitWith(node: WithNode) {
        return this._default;
    }
}

// To use this class, create a subclass and override the
// visitXXX methods that you want to handle.
export class ParseTreeWalkerSkipExpr extends ParseTreeVisitorSkipExpr<boolean> {
    constructor() {
        super(/* default */ true);
    }

    walk(node: ParseNode): void {
        const childrenToWalk = this.visitNode(node);
        if (childrenToWalk.length > 0) {
            this.walkMultiple(childrenToWalk);
        }
    }

    walkMultiple(nodes: ParseNodeArray) {
        nodes.forEach((node) => {
            if (node) {
                this.walk(node);
            }
        });
    }

    // If this.visit(node) returns true, all child nodes for the node are returned.
    // If the method returns false, we assume that the handler has already handled the
    // child nodes, so an empty list is returned.
    visitNode(node: ParseNode): ParseNodeArray {
        return this.visit(node) ? getChildNodesSkipExpr(node) : [];
    }
}
