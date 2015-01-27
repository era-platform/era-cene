// era-staccato.js
//
// Staccato is (or rather, will be) a small language and intermediate
// representation for writing implementations of untyped,
// garbage-collected, imperative languages that compile to untyped,
// garbage-collected, imperative target platforms.
//
// As a Staccato program runs, it performs simple Staccato operations
// (and maybe some custom native operations) and frequently reaches an
// opportunity for a well-defined state snapshot. For target platforms
// that support saving and loading snapshots, the snapshot formats are
// easy to convert, even if the ideal encodings and usage methods may
// vary between platforms for performance reasons.
//
// Thanks to these well-defined state snapshots, if the user pays
// close attention to what they're doing when they modify their
// Staccato programs, they may upgrade a program while continuing to
// support old snapshots -- maybe even upgrade a program while it's
// running. Staccato has been designed for these use cases! Very small
// changes to a Staccato program will not break compatibility, and
// larger changes that cause missing definition errors can be patched
// by simply providing those definitions alongside the rest of the
// program.
//
// The number of Staccato operations that occur between state
// snapshots is bounded by a function of the Staccato program
// implementation. This bound does not vary dynamically unless the
// implementation itself does! This means Staccato programs are rather
// good citizens when the target platform is a cooperative
// multithreading environment; they won't cause long pauses. (To make
// this bound meaningful, most Staccato operations can be implemented
// in constant time on most target platforms. Unfortunately, an
// exception is the (fn-frame ...) Staccato operation, which performs
// allocation.)
//
// Since the Staccato language and Staccato programs go to the trouble
// to specify an upgrade-friendly snapshot format, and new versions of
// a Staccato program can use old snapshots as they see fit,
// information hiding would be of limited use. Indeed, there would be
// a maintenance problem where function closures embedded in old
// snapshots may represent entities whose interface exposed to newer
// code should be somewhat different, even as their interface exposed
// to older code should remain the same. For this reason, Staccato
// function closures simply do not encapsulate their captured
// variables.
//
// Since Staccato function closures aren't encapsulated, they serve
// double duty as data containers, and indeed they're Staccato's only
// value type. Perhaps a Staccato value can be used like a document
// with content negotiation: If you know exactly how to interpret this
// document type, go ahead and interpret it yourself; otherwise, you
// may choose to negotiate with the document by executing it with
// access to a document describing your intentions.


function localStorageStack() {
    function get( k ) {
        var text = localStorage.get( JSON.stringify( k ) ) || "null";
        try { return JSON.parse( text ); }
        catch ( e ) { return null; }
    }
    function set( k, v ) {
        if ( v === null )
            return void localStorage.clear( JSON.stringify( k ) );
        localStorage.set( JSON.stringify( k ), JSON.stringify( v ) );
    }
    var result = {};
    result.setReturnValue = function ( v ) {
        set( "returnValue", v );
    };
    result.getReturnValue = function () {
        return get( "returnValue" );
    };
    result.push = function ( frame ) {
        var i = ~~get( "frames" );
        set( "frames", i + 1 );
        set( [ "frame", i ], [ frame.frameName, frame.env ] );
    };
    result.pop = function () {
        var i = get( "frames" );
        if ( i !== ~~i )
            return null;
        set( "frames", Math.max( 0, i - 1 ) );
        var result = get( [ "frame", i ] );
        set( [ "frame", i ], null );
        return { frameName: result[ 0 ], env: result[ 1 ] };
    };
    return result;
}

function run( stack, rules ) {
    while ( true ) {
        var frame = stack.pop();
        if ( !frame )
            return stack.getReturnValue();
        var rule = rules[ frame.frameName ];
        var newFrames = rule( frame.env, stack.getReturnValue() );
        while ( newFrames.type === "pendingFrame" ) {
            stack.push( newFrames.frame );
            newFrames = newFrames.next;
        }
        if ( newFrames.type !== "returnValue" )
            throw new Error();
        stack.setReturnValue( newFrames.returnValue );
    }
}

// def ::=
//   // This defines a frame that takes an environment with the
//   // variables needed in the tail-expr minus the given one, and
//   // takes any incoming return value. It proceeds by executing the
//   // tail-expr with that scope augmented by an entry binding the
//   // given variable to the incoming return value.
//   //
//   // The tail-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (def frame-name opt-var-list var tail-expr)
//
// // When an opt-var-list is not omitted, it overrides the usual
// // behavior for inferring the variables required by a frame
// // definition. This way, frames can be defined that receive more
// // variables than they actually use.
// opt-var-list ::=
//   // Sugar.
//   (var-list-omitted)
//
//   (var-list var-list)
//
// var-list ::=
//   (var-list-nil)
//   (var-list-cons var var-list)
//
// env-expr ::=
//   (env-nil)
//   (env-cons var temp-expr env-expr)
//
// env-pattern ::=
//   (env-pattern-nil)
//
//   // NOTE: The first var is the key in the environment, and the
//   // second var is the local variable to bind it to.
//   (env-pattern-cons var var env-expr)
//
// tail-expr ::=
//   // Sugar.
//   (tail-def def tail-expr)
//   (tail-let temp-expr tail-expr)
//
//   (temp-to-tail temp-expr)
//
//   // This calls the given temp-expr's result as a function closure
//   // with the given tail-expr's result as its argument.
//   //
//   // When implementing this operation on a target platform, it may
//   // be a good optimization to special-case
//   // (call (fn-frame frame-name env-expr) tail-expr) so that an
//   // allocation can be avoided.
//   //
//   (call temp-expr tail-expr)
//
//   // If the given temp-expr's result is a function closure that
//   // fits the given frame name and environment pattern, this
//   // proceeds as the first tail-expr with the pattern's variables
//   // in scope. Otherwise, it proceeds as the second tail-expr.
//   //
//   // Each tail-expr counts as a new root parent expression and
//   // scope boundary for the purposes of (tail-to-temp ...).
//   //
//   // Notice that even though the scope and control flow behave in
//   // special ways here, there's no need to define independent stack
//   // frames for the branches because this is a cheap operation.
//   //
//   (if-fn-frame frame-name env-pattern temp-expr
//     tail-expr
//     tail-expr)
//
// temp-expr ::=
//   // Sugar.
//   (temp-def def temp-expr)
//   (temp-let temp-expr temp-expr)
//
//   (local var)
//
//   // This forms a function closure from any frame and any
//   // environment. Whenever the function's argument is supplied, it
//   // will be used as the frame's incoming return value.
//   (fn-frame frame-name env-expr)
//
//   // Sugar.
//   //
//   // This defines and calls a frame that takes an environment with
//   // entries for the variables needed in the remainder of the
//   // parent expression minus the given variable, which (in this
//   // call) is captured from the surrounding lexical scope, and
//   // takes an incoming return value that (in this call) is the
//   // result of the given tail-expr. It proceeds by using that
//   // incoming return value as the starting point for executing the
//   // remainder of the parent expression in that scope, augmented by
//   // a binding of the variable to that incoming return value.
//   //
//   // The tail-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (tail-to-temp frame-name opt-var-list var tail-expr)
//
//   // Sugar.
//   //
//   // This defines and forms a function closure for a frame that
//   // takes an environment with the variables needed in the
//   // tail-expr minus the given variable, which (in this call) is
//   // captured from the surrounding lexical scope. The frame
//   // proceeds by executing the tail-expr with that scope augmented
//   // by an entry binding the given variable to the frame's incoming
//   // return value.
//   //
//   // The tail-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (fn frame-name opt-var-list var tail-expr)

// TODO: Implement these methods on every corresponding syntax:
// optVarList/varList set()
// optVarList or( varSet )
// optVarList/varList isProvidedProperly()
// optVarList/varList capture()
// envPattern vals()
// envPattern isProper()
// tempExpr/tailExpr/envExpr/def getFreeVars( freeVarsAfter )
// tempExpr/tailExpr/envExpr/def desugarVarLists( freeVarsAfter )
// tempExpr/tailExpr/envExpr/def hasProperScope( freeVarsAfter )
// tempExpr/tailExpr/envExpr/def desugarFn()
// tempExpr/tailExpr/envExpr/def desugarTailToTemp( freeVarsAfter )
// tempExpr/tailExpr/envExpr desugarDef()
// def desugarDefIncludingSelf()
// tempExpr/tailExpr/envExpr/def desugarLet()
//
// TODO: Implement list(), desugarDefWriterMaker, idWriterMaker,
// strMap (should be around here somewhere), strMap#subset, args.self,
// parseSyntax, and addSyntax (with its special DSL-like injection of
// an args parameter and an expr property).

function processTailToTempRoot( exprObj ) {
    var desugared = exprObj.desugarTailToTemp( strMap() );
    if ( desugared.type === "expr" ) {
        return desugared.expr;
    } else if ( desugared.type === "tailToTemp" ) {
        return processTailToTempRoot( parseSyntax(
            list( "tail-def",
                list( "def",
                    desugared.frameName.expr,
                    desugared.varList.expr,
                    desugared.va.expr,
                    desugared.frameBodyExpr ),
                list( "call"
                    list( "fn-frame", desugared.frameName.expr,
                        desugared.varList.capture() ),
                    desugared.arg.expr ) ) ) ) );
    } else {
        throw new Error();
    }
}

addSyntax( "if-fn-frame", "tailExpr",
    "frameName envPattern tailExpr tailExpr", {
    
    _map: function ( args, writerMaker, recur ) {
        var writer = writerMaker.make();
        return writer.go( list( "if-fn-frame",
            args.frameName.expr,
            args.envPattern.expr,
            writer.consume( recur( args[ 2 ].expr ) ),
            writer.consume( recur( args[ 3 ].expr ) ) ) );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        return args[ 2 ].getFreeVars( strMap() ).
            minus( args.envPattern.vals() ).
            plus( args[ 3 ].getFreeVars( strMap() ) ).
            plus( freeVarsAfter );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        return args.self._map( idWriterMaker, function ( arg ) {
            return arg.desugarVarLists( strMap() );
        } );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        return args.envPattern.isProper() &&
            args[ 2 ].hasProperScope( strMap() ) &&
            args[ 3 ].hasProperScope( strMap() );
    },
    desugarFn: function ( args ) {
        return args.self._map( idWriterMaker, function ( arg ) {
            return arg.desugarFn();
        } );
    },
    desugarTailToTemp: function ( args, freeVarsAfter ) {
        return {
            type: "expr"
            expr: list( "if-fn-frame",
                args.frameName.expr,
                args.envPattern.expr,
                processTailToTempRoot( args[ 2 ] ),
                processTailToTempRoot( args[ 3 ] ) );
        };
    },
    desugarDef: function ( args ) {
        return args.self._map( desugarDefWriterMaker,
            function ( arg ) {
            
            return arg.desugarDef();
        } );
    },
    desugarLet: function ( args ) {
        return args.self._map( idWriterMaker, function ( arg ) {
            return arg.desugarLet();
        } );
    }
} );
addSyntax( "tail-to-temp", "tempExpr",
    "frameName optVarList va tailExpr", {
    
    _map: function ( args, writerMaker, recur ) {
        var writer = writerMaker.make();
        return writer.go( list( "tail-to-temp",
            args.frameName.expr,
            args.optVarList.expr,
            args.va.expr,
            writer.consume( recur( args.tailExpr ) ) ) );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter =
            freeVarsAfter.minusKey( args.va.expr );
        var declaredInnerFreeVarsAfter = args.optVarList.set();
        return args.tailExpr.getFreeVars( strSet() ).
            plus( declaredInnerFreeVarsAfter || innerFreeVarsAfter );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter =
            freeVarsAfter.minusKey( args.va.expr );
        return list( "tail-to-temp",
            args.frameName.expr,
            args.optVarList.or( innerFreeVarsAfter ),
            args.va.expr,
            args.tailExpr.desugarVarLists( strSet() ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter =
            freeVarsAfter.minusKey( args.va.expr );
        var declaredInnerFreeVarsAfter = args.optVarList.set();
        return args.optVarList.isProvidedProperly() &&
            innerFreeVarsAfter.subset( declaredInnerFreeVarsAfter ) &&
            args.tailExpr.hasProperScope( strSet() );
    },
    desugarFn: function ( args ) {
        return args.self._map( idWriterMaker, function ( arg ) {
            return arg.desugarFn();
        } );
    },
    desugarTailToTemp: function ( args, freeVarsAfter ) {
        return {
            type: "tailToTemp",
            frameName: args.frameName,
            varList: args.optVarList,
            va: args.va,
            arg: args.tailExpr,
            frameBodyExpr: args.va.expr
        };
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    desugarLet: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "fn", "tempExpr", "frameName optVarList va tailExpr", {
    getFreeVars: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = strSet();
        var innerFreeVars = args.tailExpr.
            getFreeVars( innerFreeVarsAfter ).minus( args.va.expr );
        var declaredInnerFreeVars = args.optVarList.set();
        return (declaredInnerFreeVars || innerFreeVars).plus(
            freeVarsAfter );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = strSet();
        var innerFreeVars = args.tailExpr.
            getFreeVars( innerFreeVarsAfter ).minus( args.va.expr );
        return list( "fn",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.va.expr,
            args.tailExpr.desugarVarLists( innerFreeVarsAfter ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = strSet();
        var innerFreeVars = args.tailExpr.
            getFreeVars( innerFreeVarsAfter ).minus( args.va.expr );
        var declaredInnerFreeVars = args.optVarList.set();
        return args.optVarList.isProvidedProperly() &&
            innerFreeVars.subset( declaredInnerFreeVars ) &&
            args.tailExpr.hasProperScope( innerFreeVarsAfter );
    },
    desugarFn: function ( args ) {
        return list( "temp-def",
            list( "def", args.frameName.expr,
                args.optVarList.expr,
                args.va.expr,
                args.tailExpr.desugarFn() ),
            list( "fn-frame", args.frameName.expr,
                args.optVarList.capture() ) );
    },
    desugarTailToTemp: function ( args, freeVarsAfter ) {
        throw new Error();
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    desugarLet: function ( args ) {
        throw new Error();
    }
} );