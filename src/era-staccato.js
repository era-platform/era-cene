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
// exception is the (frame ...) Staccato operation, which performs
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


// TODO: Use localStorageStack() and run() in a runtime implementation
// of Staccato.

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
//   // variables needed in the get-expr minus the given one, and
//   // takes any incoming return value. It proceeds by executing the
//   // get-expr with that scope augmented by an entry binding the
//   // given variable to the incoming return value.
//   //
//   // The get-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (def frame-name opt-var-list var get-expr)
//
// env-expr ::=
//   (env-nil)
//   (env-cons var get-expr env-expr)
//
// get-expr ::=
//   // Sugar.
//   (tail-def def get-expr)
//   (tail-let get-expr get-expr)
//
//   (temp-to-tail get-expr)
//
//   // This calls the first given get-expr's result as a function
//   // closure with the second given get-expr's result as its
//   // argument.
//   //
//   // When implementing this operation on a target platform, it may
//   // be a good optimization to special-case
//   // (call (frame frame-name env-expr) get-expr) so that an
//   // allocation can be avoided.
//   //
//   (call get-expr get-expr)
//
//   // If the first get-expr's result is a function closure that fits
//   // the given frame name and environment pattern, this proceeds as
//   // the second get-expr with the pattern's variables in scope.
//   // Otherwise, it proceeds as the third get-expr.
//   //
//   // Each of the second and third get-expr counts as a new root
//   // parent expression and scope boundary for the purposes of
//   // (tail-to-temp ...).
//   //
//   // Notice that even though the scope and control flow behave in
//   // special ways here, there's no need to define independent stack
//   // frames for the branches because this is a cheap operation.
//   //
//   (if-frame frame-name env-pattern get-expr
//     get-expr
//     get-expr)
//
//   // Sugar.
//   (temp-def def get-expr)
//   (temp-let get-expr get-expr)
//
//   (local var)
//
//   // This forms a function closure from any frame and any
//   // environment. Whenever the function's argument is supplied, it
//   // will be used as the frame's incoming return value.
//   (frame frame-name env-expr)
//
//   // Sugar.
//   //
//   // This defines and calls a frame that takes an environment with
//   // entries for the variables needed in the remainder of the
//   // parent expression minus the given variable, which (in this
//   // call) is captured from the surrounding lexical scope, and
//   // takes an incoming return value that (in this call) is the
//   // result of the given get-expr. It proceeds by using that
//   // incoming return value as the starting point for executing the
//   // remainder of the parent expression in that scope, augmented by
//   // a binding of the variable to that incoming return value.
//   //
//   // The get-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (tail-to-temp frame-name opt-var-list var get-expr)
//
//   // Sugar.
//   //
//   // This defines and forms a function closure for a frame that
//   // takes an environment with the variables needed in the
//   // get-expr minus the given variable, which (in this call) is
//   // captured from the surrounding lexical scope. The frame
//   // proceeds by executing the get-expr with that scope augmented
//   // by an entry binding the given variable to the frame's incoming
//   // return value.
//   //
//   // The get-expr counts as a new root parent expression and scope
//   // boundary for the purposes of (tail-to-temp ...).
//   //
//   (fn frame-name opt-var-list var get-expr)
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
// env-pattern ::=
//   (env-pattern-nil)
//
//   // NOTE: The first var is the key in the environment, and the
//   // second var is the local variable to bind it to.
//   (env-pattern-cons var var env-pattern)

// NOTE: We implement these methods on every corresponding syntax:
// getExpr/envExpr/def getFreeVars( freeVarsAfter )
// getExpr/envExpr/def desugarVarLists( freeVarsAfter )
// getExpr/envExpr/def hasProperScope( freeVarsAfter )
// getExpr/envExpr/def desugarFn()
// getExpr/envExpr/def desugarTailToTemp()
// getExpr/envExpr desugarDef()
// def desugarDefIncludingSelf()
// getExpr/envExpr/def desugarLet()
// optVarList/varList set()
// optVarList or( varSet )
// optVarList/varList isProvidedProperlyForSet( varSet )
// optVarList/varList capture()
// envPattern vals()
// envPattern isProperForSets( keySet, varSet )

// NOTE: Certain parts of the implementation are marked "INTERESTING".
// These parts are tricky enough to be the motivators for the way the
// implementation has been built, and the other parts are more
// run-of-the-mill.

function JsnMap() {}
JsnMap.prototype.init_ = function ( contents ) {
    this.contents_ = contents;
    return this;
};
function jsnMap() {
    return new JsnMap().init_( strMap() );
}
JsnMap.prototype.has = function ( k ) {
    return this.contents_.has( JSON.stringify( k ) );
};
JsnMap.prototype.get = function ( k ) {
    return this.contents_.get( JSON.stringify( k ) ).v;
};
JsnMap.prototype.del = function ( k ) {
    this.contents_.del( JSON.stringify( k ) );
    return this;
};
JsnMap.prototype.set = function ( k, v ) {
    this.contents_.set( JSON.stringify( k ), { k: k, v: v } );
    return this;
};
JsnMap.prototype.setObj = function ( obj ) {
    var self = this;
    objOwnEach( obj, function ( k, v ) {
        self.set( k, v );
    } );
    return this;
};
JsnMap.prototype.setAll = function ( other ) {
    if ( !(other instanceof JsnMap) )
        throw new Error();
    this.contents_.setAll( other.contents_ );
    return this;
};
JsnMap.prototype.delAll = function ( other ) {
    if ( !(other instanceof JsnMap) )
        throw new Error();
    this.contents_.delAll( other.contents_ );
    return this;
};
JsnMap.prototype.copy = function () {
    return new JsnMap().init_( this.contents_.copy() );
};
JsnMap.prototype.add = function ( k ) {
    return this.set( k, true );
};
JsnMap.prototype.plusEntry = function ( k, v ) {
    return this.copy().set( k, v );
};
JsnMap.prototype.plusObj = function ( other ) {
    return this.copy().setObj( other );
};
JsnMap.prototype.plus = function ( other ) {
    return this.copy().setAll( other );
};
// TODO: Find a better name for this.
JsnMap.prototype.plusTruth = function ( k ) {
    return this.copy().add( k );
};
// TODO: Find a better name for this.
JsnMap.prototype.plusArrTruth = function ( arr ) {
    // TODO: Merge the trees more efficiently than this. We're using
    // AVL trees, which can supposedly merge in O( log (m + n) ) time,
    // but this operation is probably O( n * log (m + n) ).
    var result = this.copy();
    for ( var i = 0, n = arr.length; i < n; i++ )
        result.add( arr[ i ] );
    return result;
};
JsnMap.prototype.minusEntry = function ( k ) {
    return this.copy().del( k );
};
JsnMap.prototype.minus = function ( other ) {
    return this.copy().delAll( other );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.any = function ( body ) {
    return this.contents_.any( function ( kv, k ) {
        return body( kv.k, kv.v );
    } );
};
JsnMap.prototype.hasAny = function () {
    return this.contents_.hasAny();
};
JsnMap.prototype.subset = function ( other ) {
    return !this.minus( other ).hasAny();
};
// NOTE: This body takes its args as ( k, v ).
JsnMap.prototype.each = function ( body ) {
    this.any( function ( v, k ) {
        body( k, v );
        return false;
    } );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.map = function ( func ) {
    return new JsnMap().init_( this.contents_.map(
        function ( kv, k ) {
        
        return func( kv.k, kv.v );
    } ) );
};
// NOTE: This body takes its args as ( v, k ).
JsnMap.prototype.keep = function ( body ) {
    var result = jsnMap();
    this.each( function ( v, k ) {
        if ( body( v, k ) )
            result.set( k, v );
    } );
    return result;
};

function likeJsCons( x ) {
    return (true
        && likeObjectLiteral( x )
        && hasOwn( x, "first" )
        && hasOwn( x, "rest" )
    );
}
function jsListToArrBounded( x, maxLen ) {
    var result = [];
    for ( var n = 0; n <= maxLen; n++ ) {
        if ( !likeJsCons( x ) )
            return result;
        result.push( x.first );
        x = x.rest;
    }
    return null;
}

var syntaxes = strMap();
var nonterminals = strMap();
function isValidNontermName( x ) {
    return isPrimString( x )
        && /^[a-z]+$/i.test( x )
        && !(x === "self" || x in {});
}
function addStringSyntax( nontermName ) {
    if ( !isValidNontermName( nontermName ) )
        throw new Error();
    if ( !nonterminals.has( nontermName ) )
        nonterminals.set( nontermName, { type: "string" } );
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal.type !== "string" )
        throw new Error();
}
function addSyntax( name, nontermName, argNontermNamesStr, methods ) {
    if ( !(isPrimString( name )
        && isValidNontermName( nontermName )
        && isPrimString( argNontermNamesStr )) )
        throw new Error();
    if ( syntaxes.has( name ) )
        throw new Error();
    var argNontermNames = arrKeep( argNontermNamesStr.split( /\s+/g ),
        function ( name, i ) {
            return name !== "";
        } );
    var argNontermNameIsDuplicated = strMap();
    arrEach( argNontermNames, function ( name, i ) {
        if ( !isValidNontermName( name ) )
            throw new Error();
        argNontermNameIsDuplicated.set( name,
            argNontermNameIsDuplicated.has( name ) );
    } );
    if ( !nonterminals.has( nontermName ) )
        nonterminals.set( nontermName,
            { type: "sumType", cases: strMap() } );
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal.type !== "sumType" )
        throw new Error();
    nonterminal.cases.add( name );
    var methodsMap = strMap().plusObj( methods );
    methodsMap.each( function ( name, method ) {
        if ( name === "expr" || name in {} )
            throw new Error();
    } );
    syntaxes.set( name, {
        type: "sumTag",
        nontermName: nontermName,
        args: arrMap( argNontermNames, function ( nontermName, i ) {
            return {
                nontermName: nontermName,
                dslName:
                    argNontermNameIsDuplicated.get( nontermName ) ?
                        i : nontermName
            };
        } ),
        methods: strMap().plusObj( methods )
    } );
}
function parseSyntax( nontermName, expr ) {
    var nonterminal = nonterminals.get( nontermName );
    if ( nonterminal === void 0 )
        throw new Error();
    
    var result = {};
    result.expr = expr;
    
    if ( nonterminal.type === "string" ) {
        if ( !isPrimString( expr ) )
            throw new Error();
        return result;
    } else if ( nonterminal.type === "sumType" ) {
        if ( !(likeJsCons( expr )
            && isPrimString( expr.first )
            && nonterminal.cases.has( expr.first )) )
            throw new Error();
        var syntax = syntaxes.get( expr.first );
        var n = syntax.args.length;
        var argExprs = jsListToArrBounded( expr.rest, n );
        if ( argExprs === null || argExprs.length !== n )
            throw new Error();
        
        var args = {};
        args.self = result;
        arrEach( syntax.args, function ( argSyntax, i ) {
            var argExpr = argExprs[ i ];
            args[ argSyntax.dslName ] =
                parseSyntax( argSyntax.nontermName, argExpr );
        } );
        
        syntax.methods.each( function ( name, method ) {
            result[ name ] = function ( var_args ) {
                return method.apply( {},
                    [ args ].concat( [].slice.call( arguments ) ) );
            };
        } );
        return result;
    } else {
        throw new Error();
    }
}

function processTailToTempRoot( exprObj ) {
    // INTERESTING
    
    var desugared = exprObj.desugarTailToTemp();
    if ( desugared.type === "expr" ) {
        return desugared.expr;
    } else if ( desugared.type === "tailToTemp" ) {
        return processTailToTempRoot( parseSyntax( "getExpr",
            jsList( "tail-def",
                jsList( "def",
                    desugared.frameName.expr,
                    desugared.varList.expr,
                    desugared.va.expr,
                    desugared.frameBodyExpr ),
                jsList( "call",
                    jsList( "frame", desugared.frameName.expr,
                        desugared.varList.capture() ),
                    desugared.arg.expr ) ) ) );
    } else {
        throw new Error();
    }
}

function idWriter( recur ) {
    var writer = {};
    writer.consume = function ( var_args ) {
        return recur.apply( {}, arguments );
    };
    writer.redecorate = function ( whole ) {
        return whole;
    };
    return writer;
}

function desugarDefWriter() {
    var defs = [];
    
    var writer = {};
    writer.consume = function ( part ) {
        var desugared = part.desugarDef();
        defs = defs.concat( desugared.defs );
        return desugared.expr;
    };
    writer.redecorate = function ( whole ) {
        return { defs: defs, expr: whole };
    };
    return writer;
}

function desugarTailToTempWriter() {
    // INTERESTING
    
    // NOTE: This variable is mutated a maximum of one time.
    var state = { type: "exprState" };
    
    var writer = {};
    writer.consume = function ( part ) {
        // NOTE: We only desugar `part` some of the time!
        if ( state.type === "exprState" ) {
            var desugared = part.desugarTailToTemp();
            if ( desugared.type === "expr" ) {
                return desugared.expr;
            } else if ( desugared.type === "tailToTemp" ) {
                state = {
                    type: "tailToTempState",
                    frameName: desugared.frameName,
                    varList: desugared.optVarList,
                    va: desugared.va,
                    arg: desugared.getExpr
                };
                return desugared.frameBodyExpr;
            } else {
                throw new Error();
            }
        } else if ( state.type === "tailToTempState" ) {
            return part.expr;
        } else {
            throw new Error();
        }
    };
    writer.redecorate = function ( whole ) {
        if ( state.type === "exprState" ) {
            return { type: "expr", expr: whole };
        } else if ( state.type === "tailToTempState" ) {
            return {
                type: "tailToTempState",
                frameName: state.frameName,
                varList: state.optVarList,
                va: state.va,
                arg: state.getExpr,
                frameBodyExpr: whole
            };
        } else {
            throw new Error();
        }
    };
    return writer;
}

var defaults = {
    map: function ( args, writer ) {
        return writer.redecorate( args.self.expr );
    },
    mapWithFreeVarsAfter: function ( args, freeVarsAfter, writer ) {
        var parts = [];
        args.self._map( idWriter( function ( part ) {
            parts.push( part );
            return part.expr;
        } ) );
        var freeVarsMid = freeVarsAfter;
        var freeVarsMidList = [];
        for ( var i = parts.length - 1; 0 <= i; i-- ) {
            var part = parts[ i ];
            freeVarsMidList.unshift( freeVarsMid );
            if ( i !== 0 )
                freeVarsMid = part.getFreeVars( freeVarsMid );
        }
        
        var delegateWriter = {};
        delegateWriter.consume = function ( part ) {
            return writer.consume( part, freeVarsMidList.shift() );
        };
        delegateWriter.redecorate = function ( whole ) {
            return writer.redecorate( whole );
        };
        
        return args.self._map( delegateWriter );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        var parts = [];
        args.self._map( idWriter( function ( part ) {
            parts.push( part );
            return part.expr;
        } ) );
        var freeVarsMid = freeVarsAfter;
        for ( var i = parts.length - 1; 0 <= i; i-- )
            freeVarsMid = parts[ i ].getFreeVars( freeVarsMid );
        return freeVarsMid.minusEntry( [ "final" ] );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        return args.self._mapWithFreeVarsAfter( freeVarsAfter,
            idWriter( function ( arg, freeVarsAfter ) {
            
            return arg.desugarVarLists( freeVarsAfter );
        } ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var proper = true;
        args.self._mapWithFreeVarsAfter( freeVarsAfter,
            idWriter( function ( part, freeVarsAfter ) {
            
            proper = proper && part.hasProperScope( freeVarsAfter );
            return part.expr;
        } ) );
        return proper;
    },
    desugarFn: function ( args ) {
        return args.self._map( idWriter( function ( arg ) {
            return arg.desugarFn();
        } ) );
    },
    desugarTailToTemp: function ( args ) {
        return args.self._map( desugarTailToTempWriter() );
    },
    desugarDef: function ( args ) {
        return args.self._map( desugarDefWriter() );
    },
    desugarLet: function ( args ) {
        return args.self._map( idWriter( function ( arg ) {
            return arg.desugarLet();
        } ) );
    }
};

addStringSyntax( "va" );
addStringSyntax( "frameName" );
addSyntax( "def", "def", "frameName optVarList va getExpr", {
    // INTERESTING
    
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "def",
            args.frameName.expr,
            args.optVarList.expr,
            args.va.expr,
            writer.consume( args.getExpr ) ) );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        return freeVarsAfter;
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = jsnMap().plusTruth( [ "final" ] );
        var innerFreeVars = args.getExpr.
            getFreeVars( innerFreeVarsAfter ).
            minusEntry( [ "va", args.va.expr ] );
        return jsList( "def",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.va.expr,
            args.getExpr.desugarVarLists( innerFreeVarsAfter ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = jsnMap().plusTruth( [ "final" ] );
        var innerFreeVars = args.getExpr.
            getFreeVars( innerFreeVarsAfter ).
            minusEntry( [ "va", args.va.expr ] );
        var declaredInnerFreeVars = args.optVarList.set();
        return args.optVarList.isProvidedProperlyForSet( strMap() ) &&
            innerFreeVars.subset( declaredInnerFreeVars ) &&
            args.getExpr.hasProperScope( innerFreeVarsAfter );
    },
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: function ( args ) {
        return {
            type: "expr",
            expr: jsList( "def",
                args.frameName.expr,
                args.optVarList.expr,
                args.va.expr,
                processTailToTempRoot( args.getExpr ) )
        };
    },
    desugarDefIncludingSelf: function ( args ) {
        var desugared = args.getExpr.desugarDef();
        return desugared.defs.concat( [ jsList( "def",
            args.frameName.expr,
            args.optVarList.expr,
            args.va.expr,
            desugared.expr
        ) ] );
    },
    desugarLet: defaults.desugarLet
} );
addSyntax( "env-nil", "envExpr", "", {
    _map: defaults.map,
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "env-cons", "envExpr", "va getExpr envExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "env-cons",
            args.va.expr,
            writer.consume( args.getExpr ),
            writer.consume( args.envExpr ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "tail-def", "getExpr", "def getExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "tail-def",
            writer.consume( args.def ),
            writer.consume( args.getExpr ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: function ( args ) {
        var desugaredDef = args.def.desugarDefIncludingSelf();
        var desugaredExpr = args.getExpr.desugarDefs();
        return {
            defs: desugaredDef.concat( desugaredExpr.defs ),
            expr: desugaredExpr.expr
        };
    },
    desugarLet: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "tail-let", "getExpr", "getExpr getExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "tail-let",
            writer.consume( args[ 0 ] ),
            writer.consume( args[ 1 ] ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: function ( args ) {
        return args[ 1 ].expr;
    }
} );
addSyntax( "temp-to-tail", "getExpr", "getExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "temp-to-tail",
            writer.consume( args.getExpr ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "call", "getExpr", "getExpr getExpr", {
    // INTERESTING
    
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "call",
            writer.consume( args[ 0 ] ),
            writer.consume( args[ 1 ] ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: function ( args, freeVarsAfter ) {
        var freeVarsMid = args[ 1 ].getFreeVars( freeVarsAfter );
        return freeVarsAfter.has( [ "final" ] ) &&
            args[ 0 ].hasProperScope( freeVarsMid ) &&
            args[ 1 ].hasProperScope( freeVarsAfter );
    },
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "if-frame", "getExpr",
    "frameName envPattern getExpr getExpr getExpr", {
    // INTERESTING
    
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "if-frame",
            args.frameName.expr,
            args.envPattern.expr,
            writer.consume( args[ 2 ] ),
            writer.consume( args[ 3 ] ),
            writer.consume( args[ 4 ] ) ) );
    },
    _mapWithFreeVarsAfter: function ( args, freeVarsAfter, writer ) {
        var freeVarsMid2 = freeVarsAfter.keep( function ( truth, k ) {
            return k[ 0 ] === "final";
        } );
        var freeVarsMid1 = args[ 3 ].getFreeVars( freeVarsMid2 ).
            minus( args.envPattern.vals() ).
            plus( args[ 4 ].getFreeVars( freeVarsMid2 ) );
        return writer.redecorate( jsList( "if-frame",
            args.frameName.expr,
            args.envPattern.expr,
            writer.consume( args[ 2 ], freeVarsMid1 ),
            writer.consume( args[ 3 ], freeVarsMid2 ),
            writer.consume( args[ 4 ], freeVarsMid2 ) ) );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        var freeVarsMid2 = freeVarsAfter.keep( function ( truth, k ) {
            return k[ 0 ] === "final";
        } );
        var freeVarsMid1 = args[ 3 ].getFreeVars( freeVarsMid2 ).
            minus( args.envPattern.vals() ).
            plus( args[ 4 ].getFreeVars( freeVarsMid2 ) );
        return args[ 2 ].getFreeVars( freeVarsMid1 ).
            plus( freeVarsAfter ).minusEntry( [ "final" ] );
    },
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: function ( args, freeVarsAfter ) {
        var freeVarsMid2 = freeVarsAfter.keep( function ( truth, k ) {
            return k[ 0 ] === "final";
        } );
        var freeVarsMid1 = args[ 3 ].getFreeVars( freeVarsMid2 ).
            minus( args.envPattern.vals() ).
            plus( args[ 4 ].getFreeVars( freeVarsMid2 ) );
        return args.envPattern.isProperForSets(
                strMap(), strMap() ) &&
            args[ 2 ].hasProperScope( freeVarsMid1 ) &&
            args[ 3 ].hasProperScope( freeVarsMid2 ) &&
            args[ 4 ].hasProperScope( freeVarsMid2 );
    },
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: function ( args ) {
        var writer = desugarTailToTempWriter();
        return writer.redecorate( jsList( "if-frame",
            args.frameName.expr,
            args.envPattern.expr,
            writer.consume( args[ 2 ] ),
            processTailToTempRoot( args[ 3 ] ),
            processTailToTempRoot( args[ 4 ] ) ) );
    },
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "temp-def", "getExpr", "def getExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "temp-def",
            writer.consume( args.def ),
            writer.consume( args.getExpr ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: function ( args ) {
        var desugaredDef = args.def.desugarDefIncludingSelf();
        var desugaredExpr = args.getExpr.desugarDefs();
        return {
            defs: desugaredDef.concat( desugaredExpr.defs ),
            expr: desugaredExpr.expr
        };
    },
    desugarLet: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "temp-let", "getExpr", "getExpr getExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "temp-let",
            writer.consume( args[ 0 ] ),
            writer.consume( args[ 1 ] ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: function ( args ) {
        return args[ 1 ].expr;
    }
} );
addSyntax( "local", "getExpr", "va", {
    _map: defaults.map,
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: function ( args, freeVarsAfter ) {
        return freeVarsAfter.plusTruth( [ "va", args.va.expr ] ).
            minusEntry( [ "final" ] );
    },
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "frame", "getExpr", "frameName envExpr", {
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "frame",
            args.frameName.expr,
            writer.consume( args.envExpr ) ) );
    },
    _mapWithFreeVarsAfter: defaults.mapWithFreeVarsAfter,
    
    getFreeVars: defaults.getFreeVars,
    
    desugarVarLists: defaults.desugarVarLists,
    hasProperScope: defaults.hasProperScope,
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: defaults.desugarTailToTemp,
    desugarDef: defaults.desugarDef,
    desugarLet: defaults.desugarLet
} );
addSyntax( "tail-to-temp", "getExpr",
    "frameName optVarList va getExpr", {
    // INTERESTING
    
    _map: function ( args, writer ) {
        return writer.redecorate( jsList( "tail-to-temp",
            args.frameName.expr,
            args.optVarList.expr,
            args.va.expr,
            writer.consume( args.getExpr ) ) );
    },
    
    getFreeVars: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = freeVarsAfter.
            minusEntry( [ "va", args.va.expr ] ).
            minusEntry( [ "final" ] );
        var declaredInnerFreeVarsAfter = args.optVarList.set();
        return args.getExpr.
            getFreeVars( jsnMap().plusTruth( [ "final" ] ) ).
            plus( declaredInnerFreeVarsAfter || innerFreeVarsAfter );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = freeVarsAfter.
            minusEntry( [ "va", args.va.expr ] ).
            minusEntry( [ "final" ] );
        return jsList( "tail-to-temp",
            args.frameName.expr,
            args.optVarList.or( innerFreeVarsAfter ),
            args.va.expr,
            args.getExpr.desugarVarLists(
                jsnMap().plusTruth( [ "final" ] ) ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = freeVarsAfter.
            minusEntry( [ "va", args.va.expr ] ).
            minusEntry( [ "final" ] );
        var declaredInnerFreeVarsAfter = args.optVarList.set();
        return args.optVarList.isProvidedProperlyForSet( strMap() ) &&
            innerFreeVarsAfter.subset( declaredInnerFreeVarsAfter ) &&
            args.getExpr.hasProperScope(
                jsnMap().plusTruth( [ "final" ] ) );
    },
    desugarFn: defaults.desugarFn,
    desugarTailToTemp: function ( args ) {
        return {
            type: "tailToTemp",
            frameName: args.frameName,
            varList: args.optVarList,
            va: args.va,
            arg: args.getExpr,
            frameBodyExpr: jsList( "local", args.va.expr )
        };
    },
    desugarDef: function ( args ) {
        throw new Error();
    },
    desugarLet: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "fn", "getExpr", "frameName optVarList va getExpr", {
    // INTERESTING
    
    getFreeVars: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = jsnMap().plusEntry( [ "final" ] );
        var innerFreeVars = args.getExpr.
            getFreeVars( innerFreeVarsAfter ).
            minusEntry( [ "va", args.va.expr ] );
        var declaredInnerFreeVars = args.optVarList.set();
        return (declaredInnerFreeVars || innerFreeVars).plus(
            freeVarsAfter ).minusEntry( [ "final" ] );
    },
    
    desugarVarLists: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = jsnMap().plusEntry( [ "final" ] );
        var innerFreeVars = args.getExpr.
            getFreeVars( innerFreeVarsAfter ).
            minusEntry( [ "va", args.va.expr ] );
        return jsList( "fn",
            args.frameName.expr,
            args.optVarList.or( innerFreeVars ),
            args.va.expr,
            args.getExpr.desugarVarLists( innerFreeVarsAfter ) );
    },
    hasProperScope: function ( args, freeVarsAfter ) {
        var innerFreeVarsAfter = jsnMap().plusEntry( [ "final" ] );
        var innerFreeVars = args.getExpr.
            getFreeVars( innerFreeVarsAfter ).
            minusEntry( [ "va", args.va.expr ] );
        var declaredInnerFreeVars = args.optVarList.set();
        return args.optVarList.isProvidedProperlyForSet( strMap() ) &&
            innerFreeVars.subset( declaredInnerFreeVars ) &&
            args.getExpr.hasProperScope( innerFreeVarsAfter );
    },
    desugarFn: function ( args ) {
        return jsList( "temp-def",
            jsList( "def", args.frameName.expr,
                args.optVarList.expr,
                args.va.expr,
                args.getExpr.desugarFn() ),
            jsList( "frame", args.frameName.expr,
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
addSyntax( "var-list-omitted", "optVarList", "", {
    set: function ( args ) {
        return jsnMap();
    },
    or: function ( args, varSet ) {
        var varSetExpr = jsList( "var-list-nil" );
        varSet.each( function ( truth, va ) {
            if ( va[ 0 ] !== "va" )
                throw new Error();
            varSetExpr =
                jsList( "var-list-cons", va[ 1 ], varSetExpr );
        } );
        return jsList( "var-list", varSetExpr ) ;
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return false;
    },
    capture: function ( args ) {
        throw new Error();
    }
} );
addSyntax( "var-list", "optVarList", "varList", {
    set: function ( args ) {
        return args.varList.set();
    },
    or: function ( args, varSet ) {
        return args.self.expr;
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return args.varList.isProvidedProperlyForSet( varSet );
    },
    capture: function ( args ) {
        return args.varList.capture();
    }
} );
addSyntax( "var-list-nil", "varList", "", {
    set: function ( args ) {
        return jsnMap();
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return true;
    },
    capture: function ( args ) {
        return jsList( "env-nil" );
    }
} );
addSyntax( "var-list-cons", "varList", "va varList", {
    set: function ( args ) {
        return args.varList.set().plusTruth( [ "va", args.va.expr ] );
    },
    isProvidedProperlyForSet: function ( args, varSet ) {
        return !varSet.has( args.va.expr ) &&
            args.varList.isProvidedProperlyForSet(
                varSet.plusTruth( args.va.expr ) );
    },
    capture: function ( args ) {
        return jsList( "env-cons",
            args.va.expr,
            jsList( "local", args.va.expr ),
            args.varList.capture() );
    }
} );
addSyntax( "env-pattern-nil", "envPattern", "", {
    vals: function ( args ) {
        return jsnMap();
    },
    isProperForSets: function ( args, keySet, varSet ) {
        return true;
    }
} );
addSyntax( "env-pattern-cons", "envPattern", "va va envPattern", {
    vals: function ( args ) {
        return args.envPattern.vals().
            plusTruth( [ "va", args[ 1 ].expr ] );
    },
    isProperForSets: function ( args, keySet, varSet ) {
        var k = args[ 0 ].expr;
        var v = args[ 1 ].expr;
        return !keySet.has( k ) && !varSet.has( v ) &&
            args.envPattern.isProperForSets(
                keySet.plusTruth( k ), varSet.plusTruth( v ) );
    }
} );

function desugarDefExpr( expr ) {
    var parsed = parseSyntax( "def", expr );
    var noVarLists =
        parseSyntax( "def", parsed.desugarVarLists( jsnMap() ) );
    if ( !noVarLists.hasProperScope( jsnMap() ) )
        throw new Error();
    var noFns = parseSyntax( "def", noVarLists.desugarFn() );
    var noTailToTempsResult = noVarLists.desugarTailToTemp();
    if ( noTailToTempsResult.type !== "expr" )
        throw new Error();
    var noTailToTemps =
        parseSyntax( "def", noTailToTempsResult.expr );
    return arrMap( noTailToTemps.desugarDefIncludingSelf(),
        function ( def ) {
        
        var parsed = parseSyntax( "def", def );
        return parsed.desugarLet();
        return noLet;
    } );
}

function staccatoPretty( expr ) {
    if ( expr === null ) {
        return "()";
    } else if ( isPrimString( expr ) ) {
        return /^[-a-z]*$/i.test( expr ) ? expr :
            JSON.stringify( expr );
    } else if ( likeJsCons( expr ) ) {
        if ( expr.rest === null ) {
            if ( expr.first === null || likeJsCons( expr.first ) ) {
                return "(/" +
                    staccatoPretty( expr.first ).substring( 1 );
            } else {
                return "(" + staccatoPretty( expr.first ) + ")";
            }
        } else if ( likeJsCons( expr.rest ) ) {
            return "(" + staccatoPretty( expr.first ) + " " +
                staccatoPretty( expr.rest ).substring( 1 );
        } else {
            return "(" + staccatoPretty( expr.first ) + " . " +
                staccatoPretty( expr.rest ) + ")";
        }
    } else {
        throw new Error();
    }
}

function stcListMacro( cons, nil, args ) {
    var result = jsList( nil );
    for ( var i = args.length - 1; 0 <= i; i-- ) {
        result = jsList( cons, args[ i ], result );
    }
    return result;
}

function stcEntriesMacro( entry, nil, args ) {
    var n = args.length;
    if ( n % 2 !== 0 )
        throw new Error();
    var result = jsList( nil );
    for ( var i = n - 2; 0 <= i; i -= 2 ) {
        result = jsList( entry, args[ i ], args[ i + 1 ], result );
    }
    return result;
}

function stcEntriesPairMacro( entry, nil, first, second ) {
    var n = first.length;
    if ( n !== second.length )
        throw new Error();
    var result = jsList( nil );
    for ( var i = n - 1; 0 <= i; i-- ) {
        result = jsList( entry, first[ i ], second[ i ], result );
    }
    return result;
}

function stcEnvArr( args ) {
    return stcEntriesMacro( "env-cons", "env-nil", args );
}

function stcEnv( var_args ) {
    return stcEnvArr( arguments );
}

function stcEnvPatArr( args ) {
    return stcEntriesMacro(
        "env-pattern-cons", "env-pattern-nil", args );
}

function stcEnvPat( var_args ) {
    return stcEnvPatArr( arguments );
}

function stcFrame( frameName, var_args ) {
    return jsList( "frame", frameName,
        stcEnvArr( [].slice.call( arguments, 1 ) ) );
}

function stcYesVarsArr( args ) {
    return jsList( "var-list",
        stcListMacro( "var-list-cons", "var-list-nil", args ) );
}

function stcYesVars( var_args ) {
    return stcYesVarsArr( arguments );
}

// TODO: See if we'll use this.
function stcNoVars() {
    return jsList( "var-list-omitted" );
}

function stcv( va ) {
    return jsList( "local", va );
}

function stcvTail( va ) {
    return jsList( "temp-to-tail", stcv( va ) );
}

// TODO: See if we'll use this.
function stcIfFrame( expr, frameName, var_args ) {
    var n = arguments.length;
    if ( n < 4 )
        throw new Error();
    var entries = [].slice.call( arguments, 2, n - 2 );
    var then = arguments[ n - 2 ];
    var els = arguments[ n - 1 ];
    return jsList( "if-frame", frameName, stcEnvPatArr( entries ),
        expr,
        then,
        els );
}

function stcCallFrame( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 2 )
        throw new Error();
    var entries = [].slice.call( arguments, 1, n - 1 );
    var input = arguments[ n - 1 ];
    return jsList( "call",
        jsList( "frame", frameName, stcEnvArr( entries ) ),
        input );
}

function stcYesDef( frameName, var_args ) {
    var n = arguments.length;
    if ( n < 3 )
        throw new Error();
    var frameVars = [].slice.call( arguments, 1, n - 2 );
    var input = arguments[ n - 2 ];
    var body = arguments[ n - 1 ];
    return jsList( "def", frameName,
        stcYesVarsArr( frameVars ),
        input,
        body );
}

function stcType( frameName, var_args ) {
    var frameVars = [].slice.call( arguments, 1 );
    var n = frameVars.length;
    
    var result = {};
    result.make = function ( var_args ) {
        if ( arguments.length !== n )
            throw new Error();
        return jsList( "frame", frameName,
            stcEntriesPairMacro(
                "env-cons", "env-nil", frameVars, arguments ) );
    };
    result.cond = function ( var_args ) {
        if ( arguments.length !== n + 3 )
            throw new Error();
        var localVars = [].slice.call( arguments, 0, n );
        var expr = arguments[ n ];
        var then = arguments[ n + 1 ];
        var els = arguments[ n + 2 ];
        return jsList( "if-frame", frameName,
            stcEntriesPairMacro(
                "env-pattern-cons", "env-pattern-nil",
                frameVars, localVars ),
            expr,
            then,
            els );
    };
    return result;
}


// TODO: Move this testing code somewhere better.
// TODO: Try more syntaxes. Especially try something which uses
// (tail-to-temp ...) and (fn ...).

function logDefs( defExpr ) {
    console.log( arrMap( desugarDefExpr( defExpr ), function ( def ) {
        return staccatoPretty( def );
    } ) );
}

var stcCons = stcType( "cons", "car", "cdr" );

logDefs(
    stcYesDef( "rev-onto", "target", "source",
        stcCons.cond( "car", "cdr", stcv( "source" ),
            stcCallFrame( "rev-onto", "target",
                stcCons.make( stcv( "car" ), stcv( "target" ) ),
                stcvTail( "cdr" ) ),
            stcvTail( "target" ) ) ) );

logDefs(
    stcYesDef( "rev", "source",
        stcCallFrame( "rev-onto", "target", stcFrame( "nil" ),
            stcvTail( "source" ) ) ) );

logDefs(
    stcYesDef( "append", "past", "rest",
        stcCallFrame( "rev-onto", "target", stcv( "rest" ),
            stcCallFrame( "rev", stcvTail( "past" ) ) ) ) );

logDefs(
    stcYesDef( "pass-to", "arg", "func",
        jsList( "call", stcv( "func" ), stcvTail( "arg" ) ) ) );

logDefs(
    stcYesDef( "foldl-iter", "list", "combiner", "init",
        stcCons.cond( "car", "cdr", stcv( "list" ),
            stcCallFrame( "foldl-iter",
                "list", stcv( "cdr" ),
                "combiner", stcv( "combiner" ),
                stcCallFrame( "pass-to", "arg", stcv( "car" ),
                    jsList( "call", stcv( "combiner" ),
                        stcvTail( "init" ) ) ) ),
            stcvTail( "init" ) ) ) );
