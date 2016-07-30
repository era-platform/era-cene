// era-cene-runtime.js
// Copyright 2015, 2016 Ross Angle. Released under the MIT License.
//
// This file implements the main Cene runtime and built-in operators.


// NOTE: We've tagged code with "#GEN" if it generates JavaScript code
// strings directly.
//
// TODO: For each of these, make sure user-defined macros can produce
// these kinds of generated code with sufficient flexibility. If they
// have to look up the built-in macros to do it, that's probably not
// good enough; macro calls sometimes require namespaces when there's
// no namespace really needed for this task, etc.
//
// TODO: It would be nice to update the JavaScript FFI so that it's
// not repeatedly evaluating JavaScript code strings at run time. We
// can do this by having the JavaScript code strings executed at
// load time instead, but that means some of our generated code needs
// to have metadata saying what its load-time dependencies are.
//
// TODO: At some point we may want more than one compilation target,
// even without leaving JavaScript: For instance, the asynchronous
// `macLookupThen`/`macLookupRet` target we have now, a synchronous
// target, and a target specialized for continuous reactive
// programming. Unfortunately, if we do want all these targets, we may
// need to offer multiple implementations of each builtin as well, and
// that'll easily become difficult to maintain. See if there's
// anything we can do to prepare for these.


function stcIdentifier( identifier ) {
    // #GEN
    return "_stc_" +
        JSON.stringify( identifier ).replace( /[^a-z01-9]/g,
            function ( c ) {
            
            if ( c === "-" )
                return "__";
            var hexWithExcess = "0000" +
                c.charCodeAt( 0 ).toString( 16 ).toUpperCase();
            return "_" +
                hexWithExcess.substring( hexWithExcess.length - 4 );
        } );
}

function stcCallArr( func, argsArr ) {
    // #GEN
    var result = func;
    arrEach( argsArr, function ( arg ) {
        result =
            "macLookupThen( " + result + ", " +
                "function ( stcLocal_result ) {\n" +
            "    \n" +
            "    return macLookupThen( " + arg + ", " +
                    "function ( stcLocal_arg ) {\n" +
            "        \n" +
            "        return stcLocal_result.callStc( rt, " +
                        "stcLocal_arg );\n" +
            "    } );\n" +
            "} )";
    } );
    return result;
}

function stcCall( func, var_args ) {
    return stcCallArr( func, [].slice.call( arguments, 1 ) );
}

function stcFn( var_args ) {
    // #GEN
    var n = arguments.length;
    var vars = [].slice.call( arguments, 0, n - 1 );
    var body = arguments[ n - 1 ];
    var result = body;
    for ( var i = n - 2; 0 <= i; i-- ) {
        var va = vars[ i ];
        var vaIdentifier = stcIdentifier( va );
        result =
            "macLookupRet( " +
                "new StcFn( " +
                    "function ( rt, " + vaIdentifier + " ) { " +
                
                "return " + result + "; " +
            "} ) )";
    }
    return result;
}

function stcConstructorName( definitionNs, stringyName ) {
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "constructor-names", definitionNs ) ) ).name;
}

function stcConstructorTag( definitionNs, constructorName ) {
    return stcNsGet( "tag",
        stcNsGet( constructorName,
            stcNsGet( "constructors", definitionNs ) ) ).name;
}

function stcProjectionName(
    definitionNs, constructorName, stringyName ) {
    
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "projection-names",
                stcNsGet( constructorName,
                    stcNsGet( "constructors",
                        definitionNs ) ) ) ) ).name;
}

function stcMacroName( definitionNs, stringyName ) {
    if ( typeof stringyName !== "string" )
        return stringyName;
    return stcNsGet( "name",
        stcNsGet( stringyName,
            stcNsGet( "macro-names", definitionNs ) ) ).name;
}

function jsnCompare( a, b ) {
    function rank( x ) {
        var result = 0;
        if ( x === null )
            return result;
        result++;
        if ( typeof x === "number" && x < 0 )
            return result;
        result++;
        if ( x === 0 && 1 / x === 1 / -0 )
            return result;
        result++;
        if ( x !== x )
            return result;
        result++;
        if ( x === 0 && 1 / x === 1 / 0 )
            return result;
        result++;
        if ( typeof x === "number" && 0 < x )
            return result;
        result++;
        if ( typeof x === "string" )
            return result;
        result++;
        if ( isArray( x ) )
            return result;
        
        throw new Error();
    }
    function compareByBuiltIn( a, b ) {
        if ( a < b )
            return -1;
        if ( b < a )
            return 1;
        return 0;
    }
    var compareByRank = compareByBuiltIn( rank( a ), rank( b ) );
    if ( compareByRank !== 0 )
        return compareByRank;
    if ( typeof a === "string" || typeof a == "number" )
        return compareByBuiltIn( a, b );
    if ( isArray( a ) ) {
        // We compare by lexicographic order.
        for ( var i = 0, n = a.length, bn = b.length; i < n; i++ ) {
            if ( bn <= i )
                return 1;
            var compareElem = compareByBuiltIn( a[ i ], b[ i ] );
            if ( compareElem !== 0 )
                return compareElem;
        }
        return 0;
    }
    throw new Error();
}

function nameCompare( a, b ) {
    return jsnCompare( a, b );
}

function stcTypeArr(
    definitionNs, tupleStringyName, projStringyNames ) {
    
    var constructorName =
        stcConstructorName( definitionNs, tupleStringyName );
    var tupleName =
        stcConstructorTag( definitionNs, constructorName );
    var projNames = arrMap( projStringyNames, function ( stringy ) {
        return stcProjectionName(
            definitionNs, constructorName, stringy );
    } );
    var sortedProjNames = arrMap( projNames, function ( name, i ) {
        return { i: i, name: name };
    } ).sort( function ( a, b ) {
        return nameCompare( a.name, b.name );
    } );
    var projNamesToSortedIndices = {};
    arrEach( sortedProjNames, function ( entry, i ) {
        var stringy = projStringyNames[ entry.i ];
        if ( typeof stringy !== "string" )
            return;
        projNamesToSortedIndices[ "|" + stringy ] = i;
    } );
    var unsortedProjNames = arrMap( projStringyNames,
        function ( name, i ) {
        
        return { i: projNamesToSortedIndices[ "|" + name ],
            name: name };
    } );
    var tupleTag = JSON.stringify( stcNameTupleTagAlreadySorted(
        tupleName,
        arrMap( sortedProjNames, function ( entry ) {
            return entry.name;
        } )
    ) );
    var n = projNames.length;
    
    var result = {};
    result.type = "stcType";
    result.tupleName = tupleName;
    result.unsortedProjNames = unsortedProjNames;
    result.sortedProjNames = sortedProjNames;
    result.getTupleTag = function () {
        return tupleTag;
    };
    result.tags = function ( x ) {
        return x instanceof Stc && x.tupleTag === tupleTag;
    };
    result.getProj = function ( stc, projStringyName ) {
        if ( !(stc instanceof Stc
            && stc.tupleTag === tupleTag) )
            throw new Error();
        var i = projNamesToSortedIndices[ "|" + projStringyName ];
        if ( i === void 0 )
            throw new Error();
        return stc.projVals[ i ];
    };
    result.ofArr = function ( args ) {
        // #GEN
        if ( args.length !== n )
            throw new Error();
        
        var projectionVals =
            arrMap( sortedProjNames, function ( entry ) {
                return args[ entry.i ];
            } );
        
        var result = "macLookupRet( " +
            "new Stc( " + jsStr( tupleTag ) + ", [ " +
                arrMap( projectionVals, function ( entry, i ) {
                    return "stcLocal_proj" + i;
                } ).join( ", " ) +
            " ] ) )";
        for ( var i = projectionVals.length - 1; 0 <= i; i-- )
            result = "macLookupThen( " + projectionVals[ i ] + ", " +
                "function ( stcLocal_proj" + i + " ) {\n" +
            
            "return " + result + ";\n" +
            "} )";
        return result;
    };
    result.of = function ( var_args ) {
        return this.ofArr( [].slice.call( arguments, 0 ) );
    };
    result.ofArrNow = function ( args ) {
        if ( args.length !== n )
            throw new Error();
        
        return new Stc( tupleTag,
            arrMap( sortedProjNames, function ( entry ) {
                return args[ entry.i ];
            } ) );
    };
    result.ofNow = function ( var_args ) {
        return this.ofArrNow( [].slice.call( arguments, 0 ) );
    };
    return result;
}

function stcNsRoot() {
    return {
        name: [ "root" ],
        shadows: jsnMap()
    };
}
function stcNameGet( stringOrName, parent ) {
    
    // TODO: Determine a good value for this.
    var maxRepetitions = 1000;
    
    return (parent[ 0 ] === "get"
        && parent[ 2 ] + 1 <= maxRepetitions
        && nameCompare( parent[ 1 ], stringOrName ) === 0) ?
        [ "get", stringOrName, parent[ 2 ] + 1, parent[ 3 ] ] :
        [ "get", stringOrName, 1, parent ];
}
function stcNsGet( stringOrName, ns ) {
    return ns.shadows.has( stringOrName ) ?
        ns.shadows.get( stringOrName ) : {
            name: stcNameGet( stringOrName, ns.name ),
            shadows: jsnMap()
        };
}
function stcNsShadow( stringOrName, subNs, ns ) {
    return {
        name: ns.name,
        shadows: ns.shadows.plusEntry( stringOrName, subNs )
    };
}
function stcNameTupleTagAlreadySorted( tupleName, projNames ) {
    return [ "tuple-tag", tupleName, projNames ];
}
function stcNameIsAncestor( ancestor, descendant ) {
    var currentAncestor = ancestor;
    while ( true ) {
        if ( nameCompare( currentAncestor, descendant ) === 0 )
            return true;
        if ( !(isArray( currentAncestor )
            && currentAncestor[ 0 ] === "get") )
            return false;
        currentAncestor = currentAncestor[ 3 ];
    }
    return false;
}
// NOTE: The term "nss" is supposed to be the plural of "ns," which
// means "namespace."
function nssGet( nss, stringOrName ) {
    return {
        definitionNs: nss.definitionNs,
        uniqueNs: stcNsGet( stringOrName, nss.uniqueNs )
    };
}

function stcType( definitionNs, tupleStringyName, var_args ) {
    return stcTypeArr( definitionNs, tupleStringyName,
        [].slice.call( arguments, 2 ) );
}

function stcNameSetEmpty() {
    return function ( name ) {
        return false;
    };
}
function stcNameSetAll() {
    return function ( name ) {
        return true;
    };
}
function stcNameSetIntersection( a, b ) {
    return function ( name ) {
        return a( name ) && b( name );
    };
}
function stcNameSetNsDescendants( ns ) {
    return function ( name ) {
        return (stcNameIsAncestor( ns.name, name )
            && !ns.shadows.any( function ( v, k ) {
                return stcNameIsAncestor( stcNameGet( k, ns.name ),
                    name );
            } )
        ) || ns.shadows.any( function ( v, k ) {
            return stcNameSetNsDescendants( v )( name );
        } );
    };
}
function stcNameSetContains( nameSet, name ) {
    return nameSet( name );
}

function stcForeignInt( n ) {
    if ( n !== n || n + 1 === n || n - 1 === n )
        throw new Error();
    // We convert negative zero to positive zero.
    return new StcForeign( "int", n === -0 ? 0 : n );
}

function stcForeignStrFromJs( jsStr ) {
    return new StcForeign( "string", {
        jsStr: jsStr,
        paddedStr: jsStr.replace( /[^\uD800-\uDE00]/g, "\x00$&" )
    } );
}
function stcForeignStrFromPadded( paddedStr ) {
    return new StcForeign( "string", {
        // NOTE: We use [\d\D] to match any character, even newlines.
        jsStr: paddedStr.replace( /\x00([\d\D])/g, '$1' ),
        paddedStr: paddedStr
    } );
}

function macLookupRet( result ) {
    return { type: "ret", val: result };
}
function macLookupGet( definer, err ) {
    return { type: "get", definer: definer, err: err };
}
function macLookupProcureContributedElements( name, err ) {
    return { type: "procureContributedElements",
        name: name, err: err };
}
function macLookupThen( macLookupEffects, then ) {
    return { type: "then", first: macLookupEffects, then: then };
}

function fixYoke( yoke ) {
    yoke.bounce = function ( then ) {
        return then( yoke );
    };
    return yoke;
}
function macLookupYoke( rt ) {
    return fixYoke( { rt: rt } );
}


function prettifyTupleTag( tupleTag ) {
    return JSON.stringify(
        JSON.parse( tupleTag )[ 1 ][ 3 ][ 1 ][ 3 ][ 1 ] );
}

function Stc( tupleTag, opt_projVals ) {
    this.tupleTag = tupleTag;
    this.projVals = opt_projVals || [];
}
Stc.prototype.affiliation = "none";
Stc.prototype.callStc = function ( rt, arg ) {
    var self = this;
    
    // OPTIMIZATION: It would be ludicrous to run `JSON.parse()` on
    // every single function call, so we do an early check to see if
    // we already have access to the definition we would have blocked
    // on.
    var func = rt.functionDefs[ self.tupleTag ];
    if ( func !== void 0 )
        return func( rt, self, arg );
    
    return macLookupThen(
        macLookupGet(
            nsToDefiner(
                stcNsGet( "call",
                    stcNsGet( JSON.parse( self.tupleTag ),
                        stcNsGet( "functions", rt.defNs ) ) ) ),
            function () {
                throw new Error(
                    "No such function definition: " + self.tupleTag );
            } ),
        function ( def ) {
        
        if ( !(def instanceof StcForeign
            && def.purpose === "native-definition") )
            throw new Error();
        
        var func = def.foreignVal;
        rt.functionDefs[ self.tupleTag ] = func;
        return func( rt, self, arg );
    } );
};
Stc.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
Stc.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
Stc.prototype.toName = function () {
    // TODO: See if we can avoid this JSON.parse().
    return [ "struct", JSON.parse( this.tupleTag ) ].concat(
        arrMap( this.projVals, function ( projVal ) {
            return projVal.toName();
        } ) );
};
Stc.prototype.pretty = function () {
    return "(" + prettifyTupleTag( this.tupleTag ) +
        arrMap( this.projVals, function ( projVal ) {
            return " " + projVal.pretty();
        } ).join( "" ) + ")";
};
function StcFn( func ) {
    this.func = func;
}
StcFn.prototype.affiliation = "none";
StcFn.prototype.callStc = function ( rt, arg ) {
    var func = this.func;
    return func( rt, arg );
};
StcFn.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFn.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcFn.prototype.toName = function () {
    throw new Error();
};
StcFn.prototype.pretty = function () {
    return "(fn)";
};
function StcForeign( purpose, foreignVal ) {
    this.purpose = purpose;
    this.foreignVal = foreignVal;
}
StcForeign.prototype.affiliation = "none";
StcForeign.prototype.callStc = function ( rt, arg ) {
    var self = this;
    
    if ( self.purpose === "native-definition" )
        return macLookupRet( new StcFn( function ( rt, argVal ) {
            var func = self.foreignVal;
            return func( rt, arg, argVal );
        } ) );
    
    throw new Error();
};
StcForeign.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcForeign.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcForeign.prototype.toName = function () {
    if ( this.purpose === "string" ) {
        return this.foreignVal.jsStr;
    } else if ( this.purpose === "name" ) {
        return this.foreignVal;
    } else if ( this.purpose === "table" ) {
        var result = [ "table" ];
        this.foreignVal.each( function ( k, v ) {
            result.push( [ k, v ] );
        } );
        return result;
    } else if ( this.purpose === "int" ) {
        return [ "int", this.foreignVal ];
    } else {
        throw new Error(
            "Cene internal language error: Tried to call toName on " +
            "a StcForeign that didn't support it" );
    }
};
StcForeign.prototype.pretty = function () {
    return "(foreign " + this.purpose + " " +
        JSON.stringify( this.purpose === "string" ?
            this.foreignVal.jsStr :
            this.foreignVal ) + ")";
};
function StcDexDefault( first, second ) {
    if ( !(first.affiliation === "dex"
        && second.affiliation === "dex") )
        throw new Error();
    this.first = first;
    this.second = second;
}
StcDexDefault.prototype.affiliation = "dex";
StcDexDefault.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexDefault.prototype.dexHas = function ( rt, x ) {
    var self = this;
    
    return macLookupThen( self.first.dexHas( rt, x ),
        function ( firstResult ) {
    
    if ( rt.toBoolean( firstResult ) )
        return macLookupRet( firstResult );
    
    return self.second.dexHas( rt, x );
    
    } );
};
StcDexDefault.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexDefault.prototype.toName = function () {
    return [ "dex-default",
        this.first.toName(), this.second.toName() ];
};
StcDexDefault.prototype.pretty = function () {
    return "(dex-default " +
        this.first.pretty() + " " + this.second.pretty() + ")";
};
function StcDexGiveUp() {
    // We do nothing.
}
StcDexGiveUp.prototype.affiliation = "dex";
StcDexGiveUp.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexGiveUp.prototype.dexHas = function ( rt, x ) {
    var stcNil = stcType( rt.defNs, "nil" );
    var stcNope = stcType( rt.defNs, "nope", "val" );
    
    return macLookupRet( stcNope.ofNow( stcNil.ofNow() ) );
};
StcDexGiveUp.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexGiveUp.prototype.toName = function () {
    return [ "dex-give-up" ];
};
StcDexGiveUp.prototype.pretty = function () {
    return "(dex-give-up)";
};
function StcDexStruct( expectedTupleTag, projDexes ) {
    // NOTE: We originally didn't name this field `tupleTag` because
    // we were doing some naive `x.tupleTag === y` checks. We might as
    // well leave it this way to avoid confusion.
    this.expectedTupleTag = expectedTupleTag;
    this.projDexes = projDexes;
}
StcDexStruct.prototype.affiliation = "dex";
StcDexStruct.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexStruct.prototype.dexHas = function ( rt, x ) {
    var self = this;
    
    var stcNil = stcType( rt.defNs, "nil" );
    var stcYep = stcType( rt.defNs, "yep", "val" );
    var stcNope = stcType( rt.defNs, "nope", "val" );
    
    if ( !(x instanceof Stc && x.tupleTag === self.expectedTupleTag) )
        return macLookupRet( stcNope.ofNow( stcNil.ofNow() ) );
    
    var n = self.projDexes.length;
    return loop( 0 );
    function loop( i ) {
        if ( n <= i )
            return macLookupRet( stcYep.ofNow( stcNil.ofNow() ) );
        var projDex = self.projDexes[ i ];
        return macLookupThen(
            projDex.val.dexHas( rt, x.projVals[ projDex.i ] ),
            function ( dexResult ) {
            
            if ( !rt.toBoolean( dexResult ) )
                return macLookupRet( dexResult );
            return loop( i + 1 );
        } );
    }
};
StcDexStruct.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexStruct.prototype.toName = function () {
    // TODO: See if we can avoid this JSON.parse().
    return [ "dex-struct", JSON.parse( this.expectedTupleTag )
        ].concat( arrMap( this.projDexes, function ( projDex ) {
            return [ projDex.i, projDex.val.toName() ];
        } ) );
};
StcDexStruct.prototype.pretty = function () {
    return "(dex-struct " +
        prettifyTupleTag( this.expectedTupleTag ) +
        arrMap( this.projDexes, function ( projDex, i ) {
            return " " + projDex.i + ":" + projDex.val.pretty();
        } ).join( "" ) + ")";
};
function StcDexDex() {
    // We do nothing.
}
StcDexDex.prototype.affiliation = "dex";
StcDexDex.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexDex.prototype.dexHas = function ( rt, x ) {
    return macLookupRet( rt.fromBoolean( x.affiliation === "dex" ) );
};
StcDexDex.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexDex.prototype.toName = function () {
    return [ "dex-dex" ];
};
StcDexDex.prototype.pretty = function () {
    return "(dex-dex)";
};
function StcDexMerge() {
    // We do nothing.
}
StcDexMerge.prototype.affiliation = "dex";
StcDexMerge.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexMerge.prototype.dexHas = function ( rt, x ) {
    return macLookupRet(
        rt.fromBoolean( x.affiliation === "merge" ) );
};
StcDexMerge.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexMerge.prototype.toName = function () {
    return [ "dex-merge" ];
};
StcDexMerge.prototype.pretty = function () {
    return "(dex-merge)";
};
function StcDexFuse() {
    // We do nothing.
}
StcDexFuse.prototype.affiliation = "dex";
StcDexFuse.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexFuse.prototype.dexHas = function ( rt, x ) {
    return macLookupRet( rt.fromBoolean( x.affiliation === "fuse" ) );
};
StcDexFuse.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexFuse.prototype.toName = function () {
    return [ "dex-fuse" ];
};
StcDexFuse.prototype.pretty = function () {
    return "(dex-fuse)";
};
function StcDexName() {
    // We do nothing.
}
StcDexName.prototype.affiliation = "dex";
StcDexName.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexName.prototype.dexHas = function ( rt, x ) {
    return macLookupRet(
        rt.fromBoolean(
            x instanceof StcForeign && x.purpose === "name" ) );
};
StcDexName.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexName.prototype.toName = function () {
    return [ "dex-name" ];
};
StcDexName.prototype.pretty = function () {
    return "(dex-name)";
};
function StcDexString() {
    // We do nothing.
}
StcDexString.prototype.affiliation = "dex";
StcDexString.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexString.prototype.dexHas = function ( rt, x ) {
    return macLookupRet(
        rt.fromBoolean(
            x instanceof StcForeign && x.purpose === "string" ) );
};
StcDexString.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexString.prototype.toName = function () {
    return [ "dex-string" ];
};
StcDexString.prototype.pretty = function () {
    return "(dex-string)";
};
function StcDexByOwnMethod( dexableGetMethod ) {
    this.dexableGetMethod = dexableGetMethod;
}
StcDexByOwnMethod.prototype.affiliation = "dex";
StcDexByOwnMethod.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexByOwnMethod.prototype.dexHas = function ( rt, x ) {
    var stcDexable = stcType( rt.defNs, "dexable", "dex", "val" );
    var stcNil = stcType( rt.defNs, "nil" );
    var stcYep = stcType( rt.defNs, "yep", "val" );
    
    return macLookupThen(
        stcDexable.getProj( this.dexableGetMethod, "val"
            ).stcCall( rt, x ),
        function ( maybeOwnMethod ) {
    
    if ( stcNil.tags( maybeOwnMethod ) )
        return macLookupRet( rt.fromBoolean( false ) );
    else if ( stcYep.tags( maybeOwnMethod ) )
        return stcYep.getProj( ownMethod, "val" ).dexHas( rt, x );
    else
        throw new Error();
    
    } );
};
StcDexByOwnMethod.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexByOwnMethod.prototype.toName = function () {
    return [ "dex-by-own-method", this.dexableGetMethod.toName() ];
};
StcDexByOwnMethod.prototype.pretty = function () {
    return "(dex-by-own-method " +
        this.dexableGetMethod.pretty() + ")";
};
function StcDexFix( dexableUnwrap ) {
    this.dexableUnwrap = dexableUnwrap;
}
StcDexFix.prototype.affiliation = "dex";
StcDexFix.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexFix.prototype.dexHas = function ( rt, x ) {
    var stcDexable = stcType( rt.defNs, "dexable", "dex", "val" );
    
    return macLookupThen(
        stcDexable.getProj( this.dexableUnwrap, "val"
            ).callStc( rt, this ),
        function ( dex ) {
        
        return dex.dexHas( rt, x );
    } );
};
StcDexFix.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexFix.prototype.toName = function () {
    return [ "dex-fix", this.dexableUnwrap.toName() ];
};
StcDexFix.prototype.pretty = function () {
    return "(dex-fix " + this.dexableUnwrap.pretty() + ")";
};
function StcDexTable( dexVal ) {
    this.dexVal = dexVal;
}
StcDexTable.prototype.affiliation = "dex";
StcDexTable.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexTable.prototype.dexHas = function ( rt, x ) {
    var self = this;
    
    if ( !(x instanceof StcForeign && x.purpose === "table") )
        return macLookupRet( rt.fromBoolean( false ) );
    
    var vals = [];
    x.foreignVal.each( function ( k, v ) {
        vals.push( v );
    } );
    var n = vals.length;
    return loop( 0 );
    function loop( i ) {
        if ( n <= i )
            return macLookupRet( rt.fromBoolean( true ) );
        return macLookupThen( self.dexVal.dexHas( rt, vals[ i ] ),
            function ( dexResult ) {
            
            if ( !rt.toBoolean( dexResult ) )
                return macLookupRet( dexResult );
            
            return loop( i + 1 );
        } );
    }
};
StcDexTable.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexTable.prototype.toName = function () {
    return [ "dex-table", this.dexVal.toName() ];
};
StcDexTable.prototype.pretty = function () {
    return "(dex-table " + this.dexVal.pretty() + ")";
};
function StcDexInt() {
    // We do nothing.
}
StcDexInt.prototype.affiliation = "dex";
StcDexInt.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcDexInt.prototype.dexHas = function ( rt, x ) {
    return macLookupRet(
        rt.fromBoolean(
            x instanceof StcForeign && x.purpose === "int" ) );
};
StcDexInt.prototype.fuse = function ( rt, a, b ) {
    throw new Error();
};
StcDexInt.prototype.toName = function () {
    return [ "dex-int" ];
};
StcDexInt.prototype.pretty = function () {
    return "(dex-int)";
};
function StcMergeByDex( dexToUse ) {
    if ( dexToUse.affiliation !== "dex" )
        throw new Error();
    this.dexToUse = dexToUse;
}
StcMergeByDex.prototype.affiliation = "merge";
StcMergeByDex.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcMergeByDex.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcMergeByDex.prototype.fuse = function ( rt, a, b ) {
    var self = this;
    
    var stcNil = stcType( rt.defNs, "nil" );
    var stcYep = stcType( rt.defNs, "yep", "val" );
    
    return rt.dexHas( self.dexToUse, a, function ( hasA ) {
        if ( !hasA )
            return macLookupRet( stcNil.ofNow() );
    
    return rt.dexHas( self.dexToUse, b, function ( hasB ) {
        if ( !hasB )
            return macLookupRet( stcNil.ofNow() );
    
    return macLookupRet( stcYep.ofNow( a ) );
    
    } );
    
    } );
};
StcMergeByDex.prototype.toName = function () {
    return [ "merge-by-dex", this.dexToUse.toName() ];
};
StcMergeByDex.prototype.pretty = function () {
    return "(merge-by-dex " + this.dexToUse.pretty() + ")";
};
function StcFuseByMerge( mergeToUse ) {
    if ( mergeToUse.affiliation !== "merge" )
        throw new Error();
    this.mergeToUse = mergeToUse;
}
StcFuseByMerge.prototype.affiliation = "fuse";
StcFuseByMerge.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseByMerge.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseByMerge.prototype.fuse = function ( rt, a, b ) {
    return this.mergeToUse.fuse( rt, a, b );
};
StcFuseByMerge.prototype.toName = function () {
    return [ "fuse-by-merge", this.mergeToUse.toName() ];
};
StcFuseByMerge.prototype.pretty = function () {
    return "(fuse-by-merge " + this.mergeToUse.pretty() + ")";
};
function StcFuseIntByPlus() {
    // We do nothing.
}
StcFuseIntByPlus.prototype.affiliation = "fuse";
StcFuseIntByPlus.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseIntByPlus.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseIntByPlus.prototype.fuse = function ( rt, a, b ) {
    if ( !(a instanceof StcForeign && a.purpose === "int") )
        throw new Error();
    if ( !(b instanceof StcForeign && b.purpose === "int") )
        throw new Error();
    return macLookupRet(
        stcForeignInt( a.foreignVal + b.foreignVal ) );
};
StcFuseIntByPlus.prototype.toName = function () {
    return [ "fuse-int-by-plus" ];
};
StcFuseIntByPlus.prototype.pretty = function () {
    return "(fuse-int-by-plus)";
};
function StcFuseIntByTimes() {
    // We do nothing.
}
StcFuseIntByTimes.prototype.affiliation = "fuse";
StcFuseIntByTimes.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseIntByTimes.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseIntByTimes.prototype.fuse = function ( rt, a, b ) {
    if ( !(a instanceof StcForeign && a.purpose === "int") )
        throw new Error();
    if ( !(b instanceof StcForeign && b.purpose === "int") )
        throw new Error();
    return macLookupRet(
        stcForeignInt( a.foreignVal * b.foreignVal ) );
};
StcFuseIntByTimes.prototype.toName = function () {
    return [ "fuse-int-by-times" ];
};
StcFuseIntByTimes.prototype.pretty = function () {
    return "(fuse-int-by-times)";
};
function StcFuseStruct(
    nameTag, affiliation, expectedTupleTag, projFuses ) {
    
    this.nameTag = nameTag;
    this.affiliation = affiliation;
    // NOTE: We originally didn't name this field `tupleTag` because
    // we were doing some naive `x.tupleTag === y` checks. We might as
    // well leave it this way to avoid confusion.
    this.expectedTupleTag = expectedTupleTag;
    this.projFuses = projFuses;
    
    arrEach( projFuses, function ( projFuse ) {
        if ( projFuse.val.affiliation !== affiliation )
            throw new Error();
    } );
}
StcFuseStruct.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseStruct.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseStruct.prototype.fuse = function ( rt, a, b ) {
    var self = this;
    
    var stcNil = stcType( rt.defNs, "nil" );
    var stcYep = stcType( rt.defNs, "yep", "val" );
    
    if ( !(a instanceof Stc && a.tupleTag === self.expectedTupleTag) )
        return macLookupRet( stcNil.ofNow() );
    if ( !(b instanceof Stc && b.tupleTag === self.expectedTupleTag) )
        return macLookupRet( stcNil.ofNow() );
    
    var n = self.projFuses.length;
    return loop( 0, [] );
    function loop( i, fuseResults ) {
        if ( n <= i )
            return macLookupRet(
                stcYep.ofNow(
                    new Stc( self.expectedTupleTag,
                        arrMap( fuseResults.slice().sort(
                            function ( a, b ) {
                            
                            return a.i - b.i;
                        } ), function ( fuseResult ) {
                            return fuseResult.val;
                        } ) ) ) );
        var projFuse = self.projFuses[ i ];
        return macLookupThen(
            projFuse.val.fuse( rt,
                a.projVals[ projFuse.i ],
                b.projVals[ projFuse.i ] ),
            function ( fuseResult ) {
            
            if ( !stcYep.tags( fuseResult ) )
                return macLookupRet( stcNil.ofNow() );
            return loop( i + 1, fuseResults.concat( [ {
                i: projFuse.i,
                val: stcYep.getProj( fuseResult, "val" )
            } ] ) );
        } );
    }
};
StcFuseStruct.prototype.toName = function () {
    // TODO: See if we can avoid this JSON.parse().
    return [ this.nameTag, JSON.parse( this.expectedTupleTag )
        ].concat( arrMap( this.projFuses, function ( projDex ) {
            return [ projDex.i, projDex.val.toName() ];
        } ) );
};
StcFuseStruct.prototype.pretty = function () {
    return "(" + this.nameTag + " " +
        prettifyTupleTag( this.expectedTupleTag ) +
        arrMap( this.projFuses, function ( projDex, i ) {
            return " " + projDex.i + ":" + projDex.val.pretty();
        } ).join( "" ) + ")";
};
function StcFuseDefault(
    nameTag, affiliation, first, second ) {
    
    if ( first.affiliation !== affiliation )
        throw new Error();
    if ( second.affiliation !== affiliation )
        throw new Error();
    
    this.nameTag = nameTag;
    this.affiliation = affiliation;
    this.first = first;
    this.second = second;
}
StcFuseDefault.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseDefault.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseDefault.prototype.fuse = function ( rt, a, b ) {
    var self = this;
    
    var stcYep = stcType( rt.defNs, "yep", "val" );
    
    return macLookupThen( self.first.fuse( rt, a, b ),
        function ( firstResult ) {
    
    if ( stcYep.tags( firstResult ) )
        return macLookupRet( firstResult );
    
    return self.second.fuse( rt, a, b );
    
    } );
};
StcFuseDefault.prototype.toName = function () {
    return [ this.nameTag,
        this.first.toName(),
        this.second.toName() ];
};
StcFuseDefault.prototype.pretty = function () {
    return "(" + this.nameTag + " " +
        this.first.pretty() + " " +
        this.second.pretty() + ")";
};
function StcFuseByOwnMethod(
    nameTag, affiliation, dexableGetMethod ) {
    
    this.nameTag = nameTag;
    this.affiliation = affiliation;
    this.dexableGetMethod = dexableGetMethod;
}
StcFuseByOwnMethod.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseByOwnMethod.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseByOwnMethod.prototype.fuse = function ( rt, a, b ) {
    var stcDexable = stcType( rt.defNs, "dexable", "dex", "val" );
    var stcNil = stcType( rt.defNs, "nil" );
    var stcYep = stcType( rt.defNs, "yep", "val" );
    
    var getMethod =
        stcDexable.getProj( this.dexableGetMethod, "val" );
    
    function getFrom( x, then ) {
        return macLookupThen( getMethod.stcCall( rt, x ),
            function ( maybeOwnMethod ) {
            
            if ( stcNil.tags( maybeOwnMethod ) ) {
                return macLookupRet( stcNil.of() );
            } else if ( stcYep.tags( maybeOwnMethod ) ) {
                var method = stcYep.getProj( maybeOwnMethod, "val" );
                if ( method.affiliation !== self.affiliation )
                    return macLookupRet( stcNil.of() );
                return then( method );
            } else {
                throw new Error();
            }
        } );
    }
    
    return getFrom( a, function ( methodA ) {
    return getFrom( b, function ( methodB ) {
    
    if ( nameCompare( methodA.toName(), methodB.toName() ) !== 0 )
        return macLookupRet( stcNil.of() );
    
    return methodA.fuse( rt, a, b );
    
    } );
    } );
};
StcFuseByOwnMethod.prototype.toName = function () {
    return [ this.nameTag, this.dexableGetMethod.toName() ];
};
StcFuseByOwnMethod.prototype.pretty = function () {
    return "(" + this.nameTag + " " +
        this.dexableGetMethod.pretty() + ")";
};
function StcFuseFix( nameTag, affiliation, dexableUnwrap ) {
    this.nameTag = nameTag;
    this.affiliation = affiliation;
    this.dexableUnwrap = dexableUnwrap;
}
StcFuseFix.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseFix.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseFix.prototype.fuse = function ( rt, a, b ) {
    var self = this;
    
    var stcDexable = stcType( rt.defNs, "dexable", "dex", "val" );
    
    return macLookupThen(
        stcDexable.getProj( self.dexableUnwrap, "val"
            ).callStc( rt, self ),
        function ( merge ) {
        
        if ( merge.affiliation !== self.affiliation )
            throw new Error();
        
        return merge.fuse( rt, a, b );
    } );
};
StcFuseFix.prototype.toName = function () {
    return [ this.nameTag, this.dexableUnwrap.toName() ];
};
StcFuseFix.prototype.pretty = function () {
    return "(" + this.nameTag + " " +
        this.dexableUnwrap.pretty() + ")";
};
function StcFuseTable( nameTag, affiliation, mergeVal ) {
    if ( mergeVal.affiliation !== affiliation )
        throw new Error();
    
    this.nameTag = nameTag;
    this.affiliation = affiliation;
    this.mergeVal = mergeVal;
}
StcFuseTable.prototype.callStc = function ( rt, arg ) {
    throw new Error();
};
StcFuseTable.prototype.dexHas = function ( rt, x ) {
    throw new Error();
};
StcFuseTable.prototype.fuse = function ( rt, a, b ) {
    var self = this;
    
    if ( !(a instanceof StcForeign && a.purpose === "table") )
        throw new Error();
    if ( !(b instanceof StcForeign && b.purpose === "table") )
        throw new Error();
    
    var entries = [];
    a.foreignVal.plus( b.foreignVal ).each(
        function ( k, v ) {
        
        function get( table ) {
            var v = table.get( k );
            return v === void 0 ?
                stcNil.ofNow() :
                stcYep.ofNow( v );
        }
        entries.push(
            { k: k, a: get( a ), b: get( b ) } );
    } );
    var n = entries.length;
    return loop( 0, jsnMap() );
    function loop( i, table ) {
        if ( n <= i )
            return macLookupRet(
                new StcForeign( "table", table ) );
        var entry = entries[ i ];
        if ( entry.a === void 0 )
            return next( entry.b );
        if ( entry.b === void 0 )
            return next( entry.a );
        return macLookupThen(
            self.mergeVal.fuse( rt, entry.a, entry.b ), next );
        
        function next( v ) {
            return loop( i + 1, table.plusEntry( entry.k, v ) );
        }
    }
};
StcFuseTable.prototype.toName = function () {
    return [ this.nameTag, this.mergeVal.toName() ];
};
StcFuseTable.prototype.pretty = function () {
    return "(" + this.nameTag + " " + this.mergeVal.pretty() + ")";
};

function stcTrivialStxDetails() {
    return new StcForeign( "macro-stx-details", null );
}

function getMacroFunctionNamespace( definitionNs, name ) {
    return stcNsGet( "function",
        stcNsGet( stcMacroName( definitionNs, name ),
            stcNsGet( "macros", definitionNs ) ) );
}

function collectPutDefined( rawMode, definer, value ) {
    rawMode.putDefined.push( { definer: definer, value: value } );
}
function collectPutElement( rawMode, namespace, name, element ) {
    rawMode.putElement.push(
        { namespace: namespace, name: name, element: element } );
}
function collectPutListener( rawMode, namespace, name, listener ) {
    rawMode.putListener.push(
        { namespace: namespace, name: name, listener: listener } );
}
function collectDefer( rawMode, contributingOnlyTo, body ) {
    rawMode.defer.push( {
        contributingOnlyTo: contributingOnlyTo,
        body: body
    } );
}
function runPuts( namespaceDefs, rawMode ) {
    
    
    // First we do sanity checks to make sure the puts are not
    // overlapping and don't conflict with existing state.
    
    function assertNamesUniqueAndUnset( arr, getName ) {
        var seenAlready = jsnMap();
        arrEach( arr, function ( put ) {
            var name = getName( put );
            if ( namespaceDefs.has( name ) )
                throw new Error();
            if ( seenAlready.has( name ) )
                throw new Error();
            seenAlready.set( name, true );
        } );
    }
    
    arrEach( rawMode.putDefined, function ( put ) {
        var type = put.definer.type;
        if ( !(type === "namespace" || type === "object") )
            throw new Error();
    } );
    var putDefinedNamespaces =
        arrKeep( rawMode.putDefined, function ( put ) {
            return put.definer.type === "namespace";
        } );
    var putDefinedObjects =
        arrKeep( rawMode.putDefined, function ( put ) {
            return put.definer.type === "object";
        } );
    
    assertNamesUniqueAndUnset( putDefinedNamespaces,
        function ( put ) {
        
        return put.definer.namespace.name;
    } );
    
    var unique = !arrAny( putDefinedObjects, function ( put ) {
        if ( put.definer.visited )
            return true;
        put.definer.visited = true;
        return false;
    } );
    arrEach( putDefinedObjects, function ( put ) {
        put.definer.visited = false;
    } );
    if ( !unique )
        throw new Error();
    arrEach( putDefinedObjects, function ( put ) {
        if ( put.definer.value !== null )
            throw new Error();
    } );
    
    assertNamesUniqueAndUnset( rawMode.putElement, function ( put ) {
        return put.namespace.name;
    } );
    assertNamesUniqueAndUnset( rawMode.putListener, function ( put ) {
        return put.namespace.name;
    } );
    
    
    // Now that we know the puts are valid, we follow through on them.
    
    arrEach( putDefinedNamespaces, function ( put ) {
        namespaceDefs.set( put.definer.namespace.name, put.value );
    } );
    arrEach( putDefinedObjects, function ( put ) {
        put.definer.value = { val: put.value };
    } );
    
    var listenersFired = [];
    
    function getContributionTable( name ) {
        var k = [ "contributions", name ];
        if ( !namespaceDefs.has( k ) )
            namespaceDefs.set( k, {
                elements: jsnMap(),
                listeners: jsnMap()
            } );
        return namespaceDefs.get( k );
    }
    
    // NOTE: This adds the `listenersFired` entries for preexisting
    // listeners and new elements.
    arrEach( rawMode.putElement, function ( put ) {
        var contribs = getContributionTable( put.namespace.name );
        if ( contribs.elements.has( put.name ) )
            throw new Error();
        contribs.elements.set( put.name, put.element );
        var singletonTable = new StcForeign( "table",
            jsnMap().plusEntry( put.name, put.element ) );
        contribs.listeners.each( function ( k, v ) {
            listenersFired.push(
                { singletonTable: singletonTable, listener: v } );
        } );
    } );
    
    // NOTE: This adds the `listenersFired` entries for new listeners
    // and preexisting elements and also for new listeners and new
    // elements. It includes both old and new elements because the new
    // elements were already added above.
    arrEach( rawMode.putListener, function ( put ) {
        var contribs = getContributionTable( put.namespace.name );
        if ( contribs.listeners.has( put.name ) )
            throw new Error();
        var listenerObj = {
            contributingOnlyTo: rawMode.contributingOnlyTo,
            listener: put.listener
        };
        contribs.listeners.set( put.name, listenerObj );
        contribs.elements.each( function ( k, v ) {
            listenersFired.push( {
                singletonTable: new StcForeign( "table",
                    jsnMap().plusEntry( k, v ) ),
                listener: listenerObj
            } );
        } );
    } );
    
    
    return listenersFired;
}
function runEffects( rawMode, effects ) {
    if ( !(effects instanceof StcForeign
        && effects.purpose === "effects") )
        throw new Error();
    var effectsFunc = effects.foreignVal;
    return effectsFunc( rawMode );
}
function macLookupThenRunEffects( rawMode, effects ) {
    return macLookupThen( effects, function ( effects ) {
        return runEffects( rawMode, effects );
    } );
}

function runTopLevelMacLookupsSync(
    namespaceDefs, rt, originalThreads ) {
    
    function currentlyMode( rawMode, body ) {
        rawMode.current = true;
        var result = body();
        rawMode.current = false;
        return result;
    }
    function currentlyThread( thread, body ) {
        if ( thread.isJs )
            return body();
        return currentlyMode( thread.rawMode, body );
    }
    
    var threads = [];
    
    function addMacroThread( contributingOnlyTo, thread ) {
        var rawMode = {
            type: "macro",
            current: false,
            contributingOnlyTo: contributingOnlyTo,
            putDefined: [],
            putElement: [],
            putListener: [],
            defer: []
        };
        var monad = macLookupThen( macLookupRet( null ),
            function ( ignored ) {
        return macLookupThen(
            currentlyMode( rawMode, function () {
                return thread( rawMode );
            } ),
            function ( ignored ) {
            
            var listenersFired = runPuts( namespaceDefs, rawMode );
            arrEach( listenersFired, function ( listenerFired ) {
                addMacroThread(
                    listenerFired.listener.contributingOnlyTo,
                    function ( rawMode ) {
                    
                    return macLookupThen(
                        listenerFired.listener.listener.callStc( rt,
                            listenerFired.singletonTable ),
                        function ( effects ) {
                        
                        return currentlyMode( rawMode, function () {
                            return runEffects( rawMode, effects );
                        } );
                    } );
                } );
            } );
            arrEach( rawMode.defer, function ( deferred ) {
                addMacroThread( deferred.contributingOnlyTo,
                    function ( rawMode ) {
                    
                    var body = deferred.body;
                    return macLookupThen( body(),
                        function ( effects ) {
                        
                        return currentlyMode( rawMode, function () {
                            return runEffects( rawMode, effects );
                        } );
                    } );
                } );
            } );
            
            return macLookupRet( null );
        } );
        } );
        
        threads.push( {
            isJs: false,
            failedAdvances: 0,
            rawMode: rawMode,
            contributingOnlyTo: contributingOnlyTo,
            monad: monad
        } );
    }
    
    arrEach( originalThreads, function ( thread ) {
        if ( thread.type === "topLevelDefinitionThread" ) {
            addMacroThread( stcNameSetAll(),
                thread.macLookupEffectsOfDefinitionEffects );
        } else if ( thread.type === "jsEffectsThread" ) {
            var monad = macLookupThen(
                thread.macLookupEffectsOfJsEffects,
                function ( effects ) {
                
                if ( !(effects instanceof StcForeign
                    && effects.purpose === "js-effects") )
                    throw new Error();
                var effectsFunc = effects.foreignVal;
                return effectsFunc();
            } );
            
            threads.push( {
                isJs: true,
                failedAdvances: 0,
                rawMode: null,
                contributingOnlyTo: stcNameSetEmpty(),
                monad: monad
            } );
        } else {
            throw new Error();
        }
    } );
    
    function advanceThread( i ) {
        var thread = threads[ i ];
        
        function replaceThread( monad ) {
            threads[ i ] = {
                isJs: thread.isJs,
                failedAdvances: 0,
                rawMode: thread.rawMode,
                contributingOnlyTo: thread.contributingOnlyTo,
                monad: monad
            };
            return true;
        }
        
        if ( thread.monad.type === "ret" ) {
            return true;
        } else if ( thread.monad.type === "get"
            || thread.monad.type === "procureContributedElements" ) {
            return replaceThread(
                macLookupThen( thread.monad, function ( ignored ) {
                    return macLookupRet( null );
                } ) );
        } else if ( thread.monad.type === "then" ) {
            var then = thread.monad.then;
            if ( thread.monad.first.type === "ret" ) {
                return replaceThread(
                    currentlyThread( thread, function () {
                        return then( thread.monad.first.val );
                    } ) );
            } else if ( thread.monad.first.type === "get" ) {
                var definer = thread.monad.first.definer;
                if ( definer.type === "namespace" ) {
                    var maybeValue =
                        namespaceDefs.has( definer.namespace.name ) ?
                            { val:
                                namespaceDefs.get(
                                    definer.namespace.name ) } :
                            null;
                } else if ( definer.type === "object" ) {
                    var maybeValue = definer.value;
                } else {
                    throw new Error();
                }
                
                if ( maybeValue !== null ) {
                    return replaceThread(
                        currentlyThread( thread, function () {
                            return then( maybeValue.val );
                        } ) );
                } else {
                    thread.failedAdvances++;
                    return false;
                }
            } else if ( thread.monad.first.type ===
                "procureContributedElements" ) {
                
                // We check that the current thread has stopped
                // contributing to this state.
                if ( stcNameSetContains(
                    thread.contributingOnlyTo,
                    thread.monad.first.name ) )
                    throw new Error();
                
                // We wait for all the other threads to stop
                // contributing to this state.
                if ( !arrAny( threads, function ( otherThread ) {
                    return stcNameSetContains(
                        otherThread.contributingOnlyTo,
                        thread.monad.first.name );
                } ) ) {
                    var result = new StcForeign( "table",
                        (namespaceDefs.get(
                            [ "contributions",
                                thread.monad.first.name ] )
                            || { elements: jsnMap() }).elements );
                    return replaceThread(
                        currentlyThread( thread, function () {
                            return then( result );
                        } ) );
                } else {
                    thread.failedAdvances++;
                    return false;
                }
            } else if ( thread.monad.first.type === "then" ) {
                return replaceThread( macLookupThen(
                    thread.monad.first.first,
                    function ( val ) {
                    
                    var firstThen = thread.monad.first.then;
                    return macLookupThen( firstThen( val ), then );
                } ) );
            } else {
                throw new Error();
            }
        } else {
            throw new Error();
        }
    }
    
    function raiseErrorsForStalledThread( thread ) {
        // TODO: Stop using `setTimeout` here. We don't typically use
        // `setTimeout` directly if we can use a user-supplied defer
        // procedure instead.
        setTimeout( function () {
            var err = thread.monad.first.err;
            
            // TODO: Throwing an error and then catching it and
            // logging it like this is a little odd. See if we should
            // refactor this. For a while, we just threw an error, but
            // that made Node.js terminate with whatever error was
            // thrown first, which wasn't usually the most helpful
            // one.
            try {
                err();
                throw new Error(
                    "Encountered a `macLookupGet` that didn't " +
                    "throw an error." );
            } catch ( e ) {
                console.error( e );
            }
        }, 0 );
    }
    
    function arrAnyButKeepGoing( arr, func ) {
        var result = false;
        arrEach( arr, function ( item, i ) {
            if ( func( item, i ) )
                result = true;
        } );
        return result;
    }
    
    // We advance every thread except those which can perform
    // JavaScript side effects. We don't want to perform JavaScript
    // side effects if there's a "load-time" error on the way.
    while ( arrAnyButKeepGoing( threads.slice(),
        function ( thread, i ) {
        
        if ( thread.isJs )
            return false;
        
        return advanceThread( i );
    } ) ) {
        
        // OPTIMIZATION: In between full passes, we do short passes
        // over the most likely threads to be able to advance.
        threads.sort( function ( a, b ) {
            var compareIsJs = (b.isJs ? 1 : 0) - (a.isJs ? 1 : 0);
            if ( compareIsJs !== 0 )
                return compareIsJs;
            
            return b.failedAdvances - a.failedAdvances;
        } );
        var start;
        while (
            start = threads.length - ~~Math.sqrt( threads.length ),
            arrAnyButKeepGoing( threads.slice( start ),
                function ( thread, i ) {
                
                if ( thread.isJs )
                    return false;
                
                return advanceThread( start + i );
            } )
        ) {
            threads = arrKeep( threads, function ( thread ) {
                if ( thread.isJs )
                    return true;
                
                return thread.monad.type !== "ret";
            } );
        }
        
        threads = arrKeep( threads, function ( thread ) {
            if ( thread.isJs )
                return true;
            
            return thread.monad.type !== "ret";
        } );
    }
    
    // We raise errors for any threads that have stalled due to
    // blocking on definitions that will never come.
    if ( arrAnyButKeepGoing( threads, function ( thread ) {
        if ( thread.isJs )
            return false;
        
        raiseErrorsForStalledThread( thread );
        return true;
    } ) )
        return;
    
    // If no threads have stalled, we advance every thread, now
    // including the threads which can perform JavaScript side
    // effects.
    while ( arrAnyButKeepGoing( threads.slice(),
        function ( thread, i ) {
        
        return advanceThread( i );
    } ) ) {
        threads = arrKeep( threads, function ( thread ) {
            return thread.monad.type !== "ret";
        } );
    }
    
    // We raise errors for any threads that have stalled due to
    // blocking on definitions that will never come.
    arrEach( threads.slice(), function ( thread ) {
        raiseErrorsForStalledThread( thread );
    } );
}

function stcExecute( rt, expr ) {
    // #GEN
    return Function(
        "rt", "Stc", "StcFn", "StcForeign", "StcDexStruct",
        "StcFuseStruct", "stcForeignStrFromJs", "macLookupRet",
        "macLookupThen",
        
        // NOTE: When the code we generate for this has local
        // variables, we consistently prefix them with "stcLocal_" or
        // "_stc_". The latter is for variables that correspond to
        // variables in the original code.
        "return " + expr + ";"
        
    )( rt, Stc, StcFn, StcForeign, StcDexStruct,
        StcFuseStruct, stcForeignStrFromJs, macLookupRet,
        macLookupThen );
}

function nsToDefiner( ns ) {
    return { type: "namespace", namespace: ns };
}

function addFunctionNativeDefinition(
    defNs, rawMode, tupleTagName, impl ) {
    
    collectPutDefined( rawMode,
        nsToDefiner(
            stcNsGet( "call",
                stcNsGet( tupleTagName,
                    stcNsGet( "functions", defNs ) ) ) ),
        new StcForeign( "native-definition", impl ) );
}
function stcAddDefun( rt, defNs, rawMode, name, argName, body ) {
    // #GEN
    var tupleTagName = stcNameTupleTagAlreadySorted( name, [] );
    var innerFunc = stcExecute( rt,
        "function ( rt, " + stcIdentifier( argName ) + " ) { " +
            "return " + body + "; " +
        "}" );
    addFunctionNativeDefinition( defNs, rawMode, tupleTagName,
        function ( rt, funcVal, argVal ) {
        
        return innerFunc( rt, argVal );
    } );
}

function stcErr( msg ) {
    // #GEN
    return "(function () { " +
        "throw new Error( " + jsStr( msg ) + " ); " +
    "})()";
}

function evalStcForTest( rt, expr ) {
    return stcExecute( rt, expr );
}

function usingDefinitionNs( macroDefNs ) {
    var stcCons = stcType( macroDefNs, "cons", "car", "cdr" );
    var stcNil = stcType( macroDefNs, "nil" );
    var stcIstringNil =
        stcType( macroDefNs, "istring-nil", "string" );
    var stcIstringCons = stcType( macroDefNs, "istring-cons",
        "string-past", "interpolated", "istring-rest" );
    var stcYep = stcType( macroDefNs, "yep", "val" );
    var stcNope = stcType( macroDefNs, "nope", "val" );
    var stcStx =
        stcType( macroDefNs, "stx", "stx-details", "s-expr" );
    var stcForeign = stcType( macroDefNs, "foreign", "val" );
    var stcDexable = stcType( macroDefNs, "dexable", "dex", "val" );
    var stcCarried =
        stcType( macroDefNs, "carried", "main", "carry" );
    
    // NOTE: The "rt" stands for "runtime." This carries things that
    // are relevant at run time.
    // TODO: See if we should add `namespaceDefs` to this.
    var rt = {};
    rt.defNs = macroDefNs;
    rt.functionDefs = {};
    rt.anyTestFailed = false;
    rt.fromBoolean = function ( b ) {
        var nil = stcNil.ofNow();
        return b ? stcYep.ofNow( nil ) : stcNope.ofNow( nil );
    };
    rt.toBoolean = function ( b ) {
        return stcYep.tags( b );
    };
    rt.dexHas = function ( dex, x, then ) {
        return macLookupThen( dex.dexHas( rt, x ), function ( has ) {
            return then( rt.toBoolean( has ) );
        } );
    };
    
    function callStcMulti( rt, func, var_args ) {
        var args = arguments;
        var n = args.length;
        return loop( func, 2 );
        function loop( func, i ) {
            if ( n <= i )
                return macLookupRet( func );
            return macLookupThen( func.callStc( rt, args[ i ] ),
                function ( func ) {
                    return loop( func, i + 1 );
                } );
        }
    }
    
    function parseString( string ) {
        if ( !(string instanceof StcForeign
            && string.purpose === "string") )
            throw new Error();
        return string.foreignVal;
    }
    
    function stxToMaybeName( stx ) {
        if ( !stcStx.tags( stx ) )
            return null;
        var sExpr = stcStx.getProj( stx, "s-expr" );
        if ( stcForeign.tags( sExpr ) ) {
            var name = stcForeign.getProj( sExpr, "val" );
            if ( !(name instanceof StcForeign
                && name.purpose === "name") )
                throw new Error();
            return name.foreignVal;
        } else if ( stcIstringNil.tags( sExpr ) ) {
            return parseString(
                stcIstringNil.getProj( sExpr, "string" ) ).jsStr;
        } else {
            return null;
        }
    }
    
    function stcConsListToArray( stc ) {
        var result = [];
        for ( var currentStc = stc;
            stcCons.tags( currentStc );
            currentStc = stcCons.getProj( currentStc, "cdr" )
        ) {
            result.push( stcCons.getProj( currentStc, "car" ) );
        }
        return result;
    }
    
    function stcArrayToConsList( arr ) {
        var result = stcNil.ofNow();
        for ( var i = arr.length - 1; 0 <= i; i-- )
            result = stcCons.ofNow( arr[ i ], result );
        return result;
    }
    
    function getType( definitionNs, tupleName ) {
        var constructorName =
            stcConstructorName( definitionNs, tupleName );
        return macLookupThen(
            macLookupGet(
                nsToDefiner(
                    stcNsGet( "projection-list",
                        stcNsGet( constructorName,
                            stcNsGet( "constructors",
                                definitionNs ) ) ) ),
                function () {
                    throw new Error(
                        "No such type: " +
                        JSON.stringify( tupleName ) );
                } ),
            function ( projList ) {
            
            return macLookupRet(
                stcTypeArr( definitionNs, tupleName,
                    arrMap( stcConsListToArray( projList ),
                        function ( projName ) {
                        
                        if ( !(projName instanceof StcForeign
                            && projName.purpose === "name") )
                            throw new Error();
                        return projName.foreignVal;
                    } ) ) );
        } );
    }
    
    function extractPattern( definitionNs, body ) {
        if ( !stcCons.tags( body ) )
            throw new Error();
        var tupleNameExpr = stcCons.getProj( body, "car" );
        var tupleName = stxToMaybeName( tupleNameExpr );
        if ( tupleName === null )
            throw new Error(
                "Encountered a case branch with a tuple name that " +
                "wasn't a syntactic name: " +
                tupleNameExpr.pretty() );
        
        return macLookupThen( getType( definitionNs, tupleName ),
            function ( type ) {
            
            var remainingBody = stcCons.getProj( body, "cdr" );
            var localVars = [];
            var n = type.sortedProjNames.length;
            for ( var i = 0; i < n; i++ ) {
                if ( !stcCons.tags( remainingBody ) )
                    throw new Error();
                var localVar = stxToMaybeName(
                    stcCons.getProj( remainingBody, "car" ) );
                if ( localVar === null )
                    throw new Error();
                localVars.push( localVar );
                remainingBody =
                    stcCons.getProj( remainingBody, "cdr" );
            }
            
            var result = {};
            result.type = type;
            result.localVars = localVars;
            result.remainingBody = remainingBody;
            return macLookupRet( result );
        } );
    }
    
    // TODO: Make this expand multiple expressions concurrently.
    function stcCaseletForRunner(
        nss, rawMode, maybeVa, matchSubject, body, then ) {
        
        // #GEN
        
        function processTail( nss, rawMode, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                return macroexpand( nssGet( nss, "unique" ), rawMode,
                    stcCons.getProj( body, "car" ),
                    nssGet( nss, "outbox" ).uniqueNs,
                    function ( rawMode, expanded ) {
                    
                    return then( rawMode,
                        "return " + expanded + "; " );
                } );
            
            return macLookupThen(
                extractPattern( nss.definitionNs, body ),
                function ( pattern ) {
            
            if ( !stcCons.tags( pattern.remainingBody ) )
                throw new Error();
            
            var thenNss = nssGet( nss, "then" );
            return macroexpand( nssGet( thenNss, "unique" ),
                rawMode,
                stcCons.getProj( pattern.remainingBody, "car" ),
                nssGet( thenNss, "outbox" ).uniqueNs,
                function ( rawMode, thenBranch ) {
            
            var els = stcCons.getProj( pattern.remainingBody, "cdr" );
            
            return processTail( nssGet( nss, "tail" ), rawMode, els,
                function ( rawMode, processedTail ) {
            
            return then( rawMode, "if ( " +
                "stcLocal_matchSubject instanceof Stc " +
                "&& stcLocal_matchSubject.tupleTag === " +
                    jsStr( pattern.type.getTupleTag() ) + " " +
            ") return (function () { " +
                arrMap( pattern.type.sortedProjNames,
                    function ( entry, i ) {
                    
                    return "var " +
                        stcIdentifier(
                            pattern.localVars[ entry.i ] ) +
                        " = " +
                        "stcLocal_matchSubject.projVals[ " +
                            i + " ]; ";
                } ).join( "" ) +
                "return " + thenBranch + "; " +
            "})(); " + processedTail );
            
            } );
            
            } );
            
            } );
        }
        
        var subjectNss = nssGet( nss, "subject" );
        return macroexpand( nssGet( subjectNss, "unique" ), rawMode,
            matchSubject,
            nssGet( subjectNss, "outbox" ).uniqueNs,
            function ( rawMode, expandedSubject ) {
        return processTail( nssGet( nss, "tail" ), rawMode, body,
            function ( rawMode, processedTail ) {
        
        return macLookupThenRunEffects( rawMode,
            then(
                "macLookupThen( " + expandedSubject + ", " +
                    "function ( stcLocal_matchSubject ) { " +
                    
                    (maybeVa === null ? "" :
                        "var " +
                            stcIdentifier( maybeVa.val ) + " = " +
                            "stcLocal_matchSubject; ") +
                    processedTail +
                "} )" ) );
        
        } );
        } );
    }
    
    // TODO: Make this expand multiple expressions concurrently.
    function stcCast( nss, rawMode, matchSubject, body, then ) {
        // #GEN
        return macLookupThen(
            extractPattern( nss.definitionNs, body ),
            function ( pattern ) {
        
        if ( !stcCons.tags( pattern.remainingBody ) )
            throw new Error();
        var remainingBody1 =
            stcCons.getProj( pattern.remainingBody, "cdr" );
        if ( !stcCons.tags( remainingBody1 ) )
            throw new Error();
        var remainingBody2 = stcCons.getProj( remainingBody1, "cdr" );
        if ( stcCons.tags( remainingBody2 ) )
            throw new Error();
        
        var onCastErrNss = nssGet( nss, "on-cast-err" );
        return macroexpand( nssGet( onCastErrNss, "unique" ), rawMode,
            stcCons.getProj( pattern.remainingBody, "car" ),
            nssGet( onCastErrNss, "outbox" ).uniqueNs,
            function ( rawMode, onCastErr ) {
        var bodyNss = nssGet( nss, "body" );
        return macroexpand( nssGet( bodyNss, "unique" ), rawMode,
            stcCons.getProj( remainingBody1, "car" ),
            nssGet( bodyNss, "outbox" ).uniqueNs,
            function ( rawMode, body ) {
        var subjectNss = nssGet( nss, "subject" );
        return macroexpand( nssGet( subjectNss, "unique" ), rawMode,
            matchSubject,
            nssGet( subjectNss, "outbox" ).uniqueNs,
            function ( rawMode, expandedSubject ) {
        
        return macLookupThenRunEffects( rawMode,
            then(
                "macLookupThen( " + expandedSubject + ", " +
                    "function ( stcLocal_matchSubject ) { " +
                    
                    "if ( stcLocal_matchSubject instanceof Stc " +
                        "&& stcLocal_matchSubject.tupleTag === " +
                            jsStr( pattern.type.getTupleTag() ) +
                        " " +
                    ") return (function () { " +
                        arrMap( pattern.type.sortedProjNames,
                            function ( entry, i ) {
                            
                            return "var " +
                                stcIdentifier(
                                    pattern.localVars[ entry.i ] ) +
                                " = " +
                                "stcLocal_matchSubject.projVals[ " +
                                    i + " ]; ";
                        } ).join( "" ) +
                        "return " + body + "; " +
                    "})(); " +
                    "return " + onCastErr + "; " +
                "} )" ) );
        
        } );
        } );
        } );
        
        } );
    }
    
    function processFn( nss, rawMode, body, then ) {
        if ( !stcCons.tags( body ) )
            throw new Error();
        var body1 = stcCons.getProj( body, "cdr" );
        if ( !stcCons.tags( body1 ) )
            return macroexpand( nssGet( nss, "unique" ), rawMode,
                stcCons.getProj( body, "car" ),
                nssGet( nss, "outbox" ).uniqueNs,
                then );
        var param = stcCons.getProj( body, "car" );
        var paramName = stxToMaybeName( param );
        if ( paramName === null )
            throw new Error(
                "Called fn with a variable name that wasn't a " +
                "syntactic name: " + param.pretty() );
        return processFn( nss, rawMode, body1,
            function ( rawMode, processedRest ) {
            
            return then( rawMode,
                stcFn( paramName, processedRest ) );
        } );
    }
    
    function mapConsListToArr( list, func ) {
        var result = [];
        for ( var e = list;
            stcCons.tags( e );
            e = stcCons.getProj( e, "cdr" )
        ) {
            result.push( func( stcCons.getProj( e, "car" ) ) );
        }
        if ( !stcNil.tags( e ) )
            throw new Error();
        return result;
    }
    
    function revJsListToArr( jsList ) {
        var result = [];
        for ( var toGo = jsList; toGo !== null; toGo = toGo.rest )
            result.unshift( toGo.first );
        return result;
    }
    
    // TODO: Make this expand multiple expressions concurrently.
    function macroexpandConsListToArr( nss, rawMode, list, then ) {
        return go( nss, rawMode, list, null );
        function go( currentNss, rawMode, e, revResult ) {
            if ( !stcCons.tags( e ) ) {
                if ( !stcNil.tags( e ) )
                    throw new Error();
                
                return then( rawMode, revJsListToArr( revResult ) );
            }
            
            var firstNss = nssGet( currentNss, "first" );
            return macroexpand( nssGet( firstNss, "unique" ),
                rawMode,
                stcCons.getProj( e, "car" ),
                nssGet( firstNss, "outbox" ).uniqueNs,
                function ( rawMode, elemResult ) {
                
                return go( nssGet( currentNss, "rest" ), rawMode,
                    stcCons.getProj( e, "cdr" ),
                    { first: elemResult, rest: revResult } );
            } );
        }
    }
    
    function stcFnPure( func ) {
        return new StcFn( function ( rt, arg ) {
            return macLookupRet( func( rt, arg ) );
        } );
    }
    
    function stcAddMacro(
        definitionNs, rawMode, name, macroFunctionImpl ) {
        
        collectPutDefined( rawMode,
            nsToDefiner(
                getMacroFunctionNamespace( definitionNs, name ) ),
            stcFnPure( function ( rt, uniqueNs ) {
                return stcFnPure( function ( rt, definitionNs ) {
                    return stcFnPure( function ( rt, myStxDetails ) {
                        return stcFnPure( function ( rt, body ) {
                            return new StcFn( function ( rt, then ) {
                                if ( !(uniqueNs instanceof StcForeign
                                    && uniqueNs.purpose === "ns") )
                                    throw new Error();
                                if ( !(definitionNs instanceof
                                        StcForeign
                                    && definitionNs.purpose === "ns") )
                                    throw new Error();
                                
                                return macroFunctionImpl( {
                                    definitionNs: definitionNs.foreignVal,
                                    uniqueNs: uniqueNs.foreignVal
                                }, myStxDetails, body, function ( code ) {
                                    return then.callStc( rt,
                                        new StcForeign( "compiled-code", code ) );
                                } );
                            } );
                        } );
                    } );
                } );
            } ) );
    }
    function stcAddPureMacro(
        definitionNs, rawMode, name, macroFunctionImpl ) {
        
        stcAddMacro( definitionNs, rawMode, name,
            function ( nss, myStxDetails, body, then ) {
            
            return macLookupRet(
                macroFunctionImpl( nss, myStxDetails, body, then ) );
        } );
    }
    
    function makeDummyMode() {
        return {
            type: "dummy-mode",
            putDefined: [],
            putElement: [],
            putListener: []
        };
    }
    function commitDummyMode( namespaceDefs, rawMode ) {
        if ( rawMode.type !== "dummy-mode" )
            throw new Error();
        var listenersFired = runPuts( namespaceDefs, rawMode );
        if ( listenersFired.length !== 0 )
            throw new Error();
    }
    
    function stcAddCoreMacros( namespaceDefs, targetDefNs ) {
        
        var dummyMode = makeDummyMode();
        
        function mac( name, body ) {
            stcAddPureMacro( targetDefNs, dummyMode, name, body );
        }
        function effectfulMac( name, body ) {
            stcAddMacro( targetDefNs, dummyMode, name, body );
        }
        function effectfulFun( name, body ) {
            var constructorTag = stcConstructorTag( targetDefNs,
                stcConstructorName( targetDefNs, name ) );
            var tupleTagName =
                stcNameTupleTagAlreadySorted( constructorTag, [] );
            addFunctionNativeDefinition(
                targetDefNs, dummyMode, tupleTagName,
                function ( rt, funcVal, argVal ) {
                
                return body( rt, argVal );
            } );
            processDefType( targetDefNs, dummyMode, name, [] );
        }
        function fun( name, body ) {
            effectfulFun( name, function ( rt, argVal ) {
                return macLookupRet( body( rt, argVal ) );
            } );
        }
        
        mac( "def-type", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            
            var tupleName =
                stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( tupleName === null )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                var projNames = mapConsListToArr( body1,
                    function ( projName ) {
                        var projStringyName =
                            stxToMaybeName( projName );
                        if ( projStringyName === null )
                            throw new Error();
                        return projStringyName;
                    } );
                
                processDefType(
                    nss.definitionNs, rawMode, tupleName, projNames );
                return macLookupThenRunEffects( rawMode,
                    then( stcNil.of() ) );
            } );
        } );
        
        mac( "defn", function ( nss, myStxDetails, body, then ) {
            // #GEN
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            
            var name =
                stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( name === null )
                throw new Error();
            
            var firstArg =
                stxToMaybeName( stcCons.getProj( body1, "car" ) );
            if ( name === null )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                return processFn( nss, rawMode, body1,
                    function ( rawMode, processedFn ) {
                    
                    stcAddDefun( rt, nss.definitionNs, rawMode,
                        stcConstructorTag( nss.definitionNs,
                            stcConstructorName(
                                nss.definitionNs, name ) ),
                        firstArg,
                        stcCall( processedFn,
                            "macLookupRet( " +
                                stcIdentifier( firstArg ) + " )"
                            ) );
                    processDefType(
                        nss.definitionNs, rawMode, name, [] );
                    
                    return macLookupThenRunEffects( rawMode,
                        then( stcNil.of() ) );
                } );
            } );
        } );
        
        // TODO: Write documentation for this in docs.md and/or
        // cene-design-goals.txt.
        mac( "def-macro", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            
            var name =
                stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( name === null )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                return processFn( nss, rawMode, body1,
                    function ( rawMode, processedFn ) {
                return macLookupThen( stcExecute( rt, processedFn ),
                    function ( executedFn ) {
                
                collectPutDefined( rawMode,
                    nsToDefiner(
                        getMacroFunctionNamespace(
                            nss.definitionNs, name ) ),
                    executedFn );
                
                return macLookupThenRunEffects( rawMode,
                    then( stcNil.of() ) );
                
                } );
                } );
            } );
        } );
        
        // TODO: See if we should design a different approach to unit
        // tests. Perhaps they should allow asynchronous computation.
        // Perhaps the results should be installed as definitions
        // somewhere. Perhaps we should be able to control the order.
        //
        // TODO: Make this expand multiple expressions concurrently.
        //
        mac( "test", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            var body2 = stcCons.getProj( body1, "cdr" );
            if ( !stcCons.tags( body2 ) )
                throw new Error();
            var body3 = stcCons.getProj( body2, "cdr" );
            if ( stcCons.tags( body3 ) )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                
                function evalExpr( nss, rawMode, expr, then ) {
                    return macroexpand(
                        nssGet( nss, "unique" ),
                        rawMode,
                        expr,
                        nssGet( nss, "outbox" ).uniqueNs,
                        function ( rawMode, expanded ) {
                        
                        return macLookupThen(
                            evalStcForTest( rt, expanded ),
                            function ( evaluated ) {
                            
                            return then( rawMode, evaluated );
                        } );
                    } );
                }
                
                // NOTE: This `evalExpr` call is the only place we
                // ignore `macroexpand`'s result.
                evalExpr( nssGet( nss, "dex" ), rawMode,
                    stcCons.getProj( body, "car" ),
                    function ( rawMode, dex ) {
                return evalExpr( nssGet( nss, "a" ), rawMode,
                    stcCons.getProj( body1, "car" ),
                    function ( rawMode, a ) {
                return evalExpr( nssGet( nss, "b" ), rawMode,
                    stcCons.getProj( body2, "car" ),
                    function ( rawMode, b ) {
                return rt.dexHas( dex, a, function ( hasA ) {
                return rt.dexHas( dex, b, function ( hasB ) {
                
                var succeeded = hasA && hasB &&
                    nameCompare( a.toName(), b.toName() ) === 0;
                if ( succeeded )
                    console.log( "Test succeeded" );
                else if ( !hasA && !hasB )
                    console.log(
                        "Test failed: Expected things that matched " +
                        dex.pretty() + ", got " + a.pretty() + " " +
                        "and " + b.pretty() );
                else
                    console.log(
                        "Test failed: Expected " +
                        b.pretty() + ", got " + a.pretty() );
                
                if ( !succeeded )
                    rt.anyTestFailed = true;
                
                return macLookupRet( stcNil.ofNow() );
                
                } );
                } );
                } );
                } );
                } );
                
                return macLookupThenRunEffects( rawMode,
                    then( stcNil.of() ) );
            } );
        } );
        
        mac( "case", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            return new StcForeign( "effects", function ( rawMode ) {
                return stcCaseletForRunner( nss, rawMode, null,
                    stcCons.getProj( body, "car" ),
                    stcCons.getProj( body, "cdr" ),
                    then );
            } );
        } );
        
        mac( "caselet", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            var va = stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( va === null )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                return stcCaseletForRunner( nss, rawMode, { val: va },
                    stcCons.getProj( body1, "car" ),
                    stcCons.getProj( body1, "cdr" ),
                    then );
            } );
        } );
        
        mac( "cast", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            return new StcForeign( "effects", function ( rawMode ) {
                return stcCast( nss, rawMode,
                    stcCons.getProj( body, "car" ),
                    stcCons.getProj( body, "cdr" ),
                    then );
            } );
        } );
        
        mac( "isa", function ( nss, myStxDetails, body, then ) {
            // #GEN
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            var body2 = stcCons.getProj( body1, "cdr" );
            if ( stcCons.tags( body2 ) )
                throw new Error();
            var tupleNameExpr = stcCons.getProj( body, "car" );
            var tupleName = stxToMaybeName( tupleNameExpr );
            if ( tupleName === null )
                throw new Error(
                    "Encountered an isa with a tuple name that " +
                    "wasn't a syntactic name: " +
                    tupleNameExpr.pretty() );
            
            return new StcForeign( "effects", function ( rawMode ) {
                return macroexpand( nssGet( nss, "unique" ), rawMode,
                    stcCons.getProj( body1, "car" ),
                    nssGet( nss, "outbox" ).uniqueNs,
                    function ( rawMode, expandedBody ) {
                return macLookupThen(
                    getType( nss.definitionNs, tupleName ),
                    function ( type ) {
                
                return macLookupThenRunEffects( rawMode,
                    then(
                        "macLookupThen( " + expandedBody + ", " +
                            "function ( stcLocal_body ) {\n" +
                        "    \n" +
                        "    return stcLocal_body instanceof Stc " +
                                "&& stcLocal_body.tupleTag === " +
                                    jsStr( type.getTupleTag() ) + " ? " +
                                stcYep.of( stcNil.of() ) + " : " +
                                stcNope.of( stcNil.of() ) + ";\n" +
                        "} )" ) );
                
                } );
                } );
            } );
        } );
        
        mac( "proj1", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var body1 = stcCons.getProj( body, "cdr" );
            if ( !stcCons.tags( body1 ) )
                throw new Error();
            var body2 = stcCons.getProj( body1, "cdr" );
            if ( stcCons.tags( body2 ) )
                throw new Error();
            
            var va = stcStx.ofNow( myStxDetails,
                stcForeign.ofNow(
                    new StcForeign( "name",
                        nssGet( nss, "var" ).uniqueNs.name ) ) );
            return new StcForeign( "effects", function ( rawMode ) {
                return stcCast( nssGet( nss, "cast" ), rawMode,
                    stcCons.getProj( body1, "car" ),
                    stcArrayToConsList( [
                        stcCons.getProj( body, "car" ),
                        va,
                        stcStx.ofNow( myStxDetails,
                            stcArrayToConsList( [
                                stcStx.ofNow( myStxDetails,
                                    stcForeign.ofNow(
                                        new StcForeign( "name",
                                            stcMacroName( macroDefNs, "err" ) ) ) ),
                                stcStx.ofNow( myStxDetails,
                                    stcIstringNil.ofNow( stcForeignStrFromJs( "Internal error" ) ) )
                            ] ) ),
                        va
                    ] ),
                    then );
            } );
        } );
        
        mac( "c", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                var funcNss = nssGet( nss, "func" );
                // TODO: Make this expand multiple subexpressions
                // concurrently.
                return macroexpand( nssGet( funcNss, "unique" ),
                    rawMode,
                    stcCons.getProj( body, "car" ),
                    nssGet( funcNss, "outbox" ).uniqueNs,
                    function ( rawMode, expandedFunc ) {
                return macroexpandConsListToArr(
                    nssGet( nss, "args" ),
                    rawMode,
                    stcCons.getProj( body, "cdr" ),
                    function ( rawMode, expandedArgs ) {
                
                return macLookupThenRunEffects( rawMode,
                    then(
                        stcCallArr( expandedFunc, expandedArgs ) ) );
                
                } );
                } );
            } );
        } );
        
        mac( "c-new", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            var tupleName =
                stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( tupleName === null )
                throw new Error();
            var type = stcType( nss.definitionNs, tupleName );
            
            return new StcForeign( "effects", function ( rawMode ) {
                return macroexpandConsListToArr( nss, rawMode,
                    stcCons.getProj( body, "cdr" ),
                    function ( rawMode, expandedArgs ) {
                    
                    return macLookupThenRunEffects( rawMode,
                        then(
                            stcCallArr( type.of(), expandedArgs ) ) );
                } );
            } );
        } );
        
        function stxToDefiniteString( stx ) {
            if ( !stcStx.tags( stx ) )
                throw new Error();
            var istringNil = stcStx.getProj( stx, "s-expr" );
            if ( !stcIstringNil.tags( istringNil ) )
                throw new Error();
            return parseString(
                stcIstringNil.getProj( istringNil, "string" ) );
        }
        
        function assertValidDexable( rt, x, then ) {
            if ( !stcDexable.tags( x ) )
                throw new Error();
            
            var dex = stcDexable.getProj( x, "dex" );
            var val = stcDexable.getProj( x, "val" );
            
            return rt.dexHas( dex, val, function ( has ) {
                if ( !has )
                    throw new Error();
                
                return then( val );
            } );
        }
        
        mac( "err", function ( nss, myStxDetails, body, then ) {
            if ( !stcCons.tags( body ) )
                throw new Error();
            if ( stcCons.tags( stcCons.getProj( body, "cdr" ) ) )
                throw new Error();
            return new StcForeign( "effects", function ( rawMode ) {
                return macLookupThenRunEffects( rawMode,
                    then(
                        stcErr(
                            stxToDefiniteString(
                                stcCons.getProj(
                                    body, "car" ) ).jsStr ) ) );
            } );
        } );
        
        mac( "str", function ( nss, myStxDetails, body, then ) {
            // #GEN
            if ( !stcCons.tags( body ) )
                throw new Error();
            if ( stcCons.tags( stcCons.getProj( body, "cdr" ) ) )
                throw new Error();
            return new StcForeign( "effects", function ( rawMode ) {
                return macLookupThenRunEffects( rawMode,
                    then(
                        "macLookupRet( " +
                            "stcForeignStrFromJs( " +
                                jsStr(
                                    stxToDefiniteString( stcCons.getProj( body, "car" ) ).jsStr ) +
                            " ) )" ) );
            } );
        } );
        
        mac( "fn", function ( nss, myStxDetails, body, then ) {
            return new StcForeign( "effects", function ( rawMode ) {
                return processFn( nss, rawMode, body,
                    function ( rawMode, processedFn ) {
                    
                    return macLookupThenRunEffects( rawMode,
                        then( processedFn ) );
                } );
            } );
        } );
        
        mac( "let", function ( nss, myStxDetails, body, then ) {
            // #GEN
            return new StcForeign( "effects", function ( rawMode ) {
                return loop(
                    rawMode, 0, body, nssGet( nss, "bindings" ), "",
                    function ( rawMode, code ) {
                    
                    return macLookupThenRunEffects( rawMode,
                        then( code ) );
                } );
            } );
            
            function loop(
                rawMode, i, remainingBody, bindingsNss,
                obscureVarsCode, then ) {
                
                if ( !stcCons.tags( remainingBody ) )
                    throw new Error();
                var remainingBody1 =
                    stcCons.getProj( remainingBody, "cdr" );
                if ( !stcCons.tags( remainingBody1 ) ) {
                    var bodyNss = nssGet( nss, "body" );
                    return macroexpand( nssGet( bodyNss, "unique" ),
                        rawMode,
                        stcCons.getProj( remainingBody, "car" ),
                        nssGet( bodyNss, "outbox" ).uniqueNs,
                        function ( rawMode, body ) {
                        
                        return then( rawMode,
                            "(function () {\n" +
                            obscureVarsCode +
                            "return " + body + ";\n" +
                            "})()" );
                    } );
                }
                var va = stxToMaybeName(
                    stcCons.getProj( remainingBody, "car" ) );
                if ( va === null )
                    throw new Error();
                
                var firstNss = nssGet( bindingsNss, "first" );
                return macroexpand( nssGet( firstNss, "unique" ),
                    rawMode,
                    stcCons.getProj( remainingBody1, "car" ),
                    nssGet( firstNss, "outbox" ).uniqueNs,
                    function ( rawMode, bindingVal ) {
                    
                    var innerVar = stcIdentifier( va );
                    var obscureVar = "stcLocal_" + i;
                    
                    return loop( rawMode, i + 1,
                        stcCons.getProj( remainingBody1, "cdr" ),
                        nssGet( bindingsNss, "rest" ),
                        obscureVarsCode +
                            "var " + innerVar + " = " +
                                obscureVar + ";\n",
                        function ( rawMode, loopResult ) {
                        
                        return then( rawMode,
                            "macLookupThen( " + bindingVal + ", " +
                                "function ( " +
                                    obscureVar + " ) {\n" +
                            "return " + loopResult + ";\n" +
                            "} )" );
                    } );
                } );
            }
        } );
        
        // TODO: Make this expand multiple subexpressions
        // concurrently.
        function structMapper( nss, body, then, genJsConstructor ) {
            
            // #GEN
            
            if ( !stcCons.tags( body ) )
                throw new Error();
            var tupleName =
                stxToMaybeName( stcCons.getProj( body, "car" ) );
            if ( tupleName === null )
                throw new Error();
            
            return macLookupThen(
                getType( nss.definitionNs, tupleName ),
                function ( type ) {
                
                return macLookupRet( new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    return loop( nss, rawMode, type, 0, null,
                        stcCons.getProj( body, "cdr" ) );
                } ) );
            } );
            
            function loop( nss, rawMode, type, i, revProjVals,
                remainingBody ) {
                
                var n = type.unsortedProjNames.length;
                if ( n <= i )
                    return next( rawMode, type,
                        revProjVals, remainingBody );
                
                if ( !stcCons.tags( remainingBody ) )
                    throw new Error(
                        "Expected more arguments to " +
                        JSON.stringify( tupleName ) );
                
                var firstNss = nssGet( nss, "first" );
                
                return macroexpand( nssGet( firstNss, "unique" ),
                    rawMode,
                    stcCons.getProj( remainingBody, "car" ),
                    nssGet( firstNss, "outbox" ).uniqueNs,
                    function ( rawMode, projVal ) {
                    
                    return loop( nssGet( nss, "rest" ), rawMode, type,
                        i + 1,
                        { first:
                            { i: type.unsortedProjNames[ i ].i,
                                val: projVal },
                            rest: revProjVals },
                        stcCons.getProj( remainingBody, "cdr" ) );
                } );
            }
            
            function next(
                rawMode, type, revProjVals, remainingBody ) {
                
                if ( stcCons.tags( remainingBody ) )
                    throw new Error();
                
                var projVals = revJsListToArr( revProjVals );
                
                var result = "macLookupRet( " +
                    genJsConstructor(
                        jsStr( type.getTupleTag() ) + ", " +
                        "[ " +
                        
                        arrMap( projVals, function ( entry, i ) {
                            return "{ " +
                                "i: " +
                                    JSON.stringify( entry.i ) + ", " +
                                "val: stcLocal_proj" + i + " " +
                            "}";
                        } ).join( ", " ) + " " +
                    "]" ) + " )";
                for ( var i = projVals.length - 1; 0 <= i; i-- )
                    result = "macLookupThen( " +
                        projVals[ i ].val + ", " +
                        "function ( stcLocal_proj" + i + " ) {\n" +
                    
                    "return " + result + ";\n" +
                    "} )";
                return macLookupThenRunEffects( rawMode,
                    then( result ) );
            }
        }
        
        // TODO: Add documentation of this somewhere.
        effectfulMac( "dex-struct",
            function ( nss, myStxDetails, body, then ) {
            
            // #GEN
            
            return structMapper( nss, body, then, function ( args ) {
                return "new StcDexStruct( " + args + " )";
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-default", function ( rt, first ) {
            return stcFnPure( function ( rt, second ) {
                return new StcDexDefault( first, second );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-give-up", function ( rt, ignored ) {
            return new StcDexGiveUp();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-dex", function ( rt, ignored ) {
            return new StcDexDex();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-merge", function ( rt, ignored ) {
            return new StcDexMerge();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-fuse", function ( rt, ignored ) {
            return new StcDexFuse();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-name", function ( rt, ignored ) {
            return new StcDexName();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-string", function ( rt, ignored ) {
            return new StcDexString();
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "dex-by-own-method",
            function ( rt, dexableGetMethod ) {
            
            return assertValidDexable( rt, dexableGetMethod,
                function ( getMethod ) {
                
                return macLookupRet(
                    new StcDexByOwnMethod( dexableGetMethod ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "dex-fix", function ( rt, dexableUnwrap ) {
            return assertValidDexable( rt, dexableUnwrap,
                function ( unwrap ) {
                
                return macLookupRet( new StcDexFix( dexableUnwrap ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-table", function ( rt, dexVal ) {
            if ( dexVal.affiliation !== "dex" )
                throw new Error();
            return new StcDexTable( dexVal );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "dex-int", function ( rt, ignored ) {
            return new StcDexInt();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "call-dex", function ( rt, dex ) {
            return stcFnPure( function ( rt, a ) {
                return new StcFn( function ( rt, b ) {
                    return rt.dexHas( dex, a, function ( hasA ) {
                        if ( !hasA )
                            return macLookupRet( stcNil.ofNow() );
                    
                    return rt.dexHas( dex, b, function ( hasB ) {
                        if ( !hasB )
                            return macLookupRet( stcNil.ofNow() );
                    
                    var result =
                        nameCompare( a.toName(), b.toName() );
                    if ( result < 0 )
                        return macLookupRet(
                            stcYep.ofNow(
                                new StcForeign( "lt", null ) ) );
                    if ( 0 < result )
                        return macLookupRet(
                            stcYep.ofNow(
                                new StcForeign( "gt", null ) ) );
                    
                    return macLookupRet(
                        stcYep.ofNow( stcNil.ofNow() ) );
                    
                    } );
                    
                    } );
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "in-dex", function ( rt, dex ) {
            return new StcFn( function ( rt, x ) {
                return dex.dexHas( rt, x );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "merge-by-dex", function ( rt, dex ) {
            return new StcMergeByDex( dex );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulMac( "merge-struct",
            function ( nss, myStxDetails, body, then ) {
            
            // #GEN
            
            return structMapper( nss, body, then, function ( args ) {
                return "new StcFuseStruct( " +
                    "\"merge-struct\", \"merge\", " + args + " )";
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "merge-default", function ( rt, first ) {
            return stcFnPure( function ( rt, second ) {
                return new StcFuseDefault( "merge-default", "merge",
                    first, second );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "merge-by-own-method",
            function ( rt, dexableGetMethod ) {
            
            return assertValidDexable( rt, dexableGetMethod,
                function ( getMethod ) {
                
                return macLookupRet(
                    new StcFuseByOwnMethod( "merge-by-own-method",
                        "merge",
                        dexableGetMethod ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "merge-fix", function ( rt, dexableUnwrap ) {
            return assertValidDexable( rt, dexableUnwrap,
                function ( unwrap ) {
                
                return macLookupRet(
                    new StcFuseFix( "merge-fix", "merge",
                        dexableUnwrap ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "merge-table", function ( rt, mergeVal ) {
            return new StcFuseTable( "merge-table", "merge",
                mergeVal );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "call-merge", function ( rt, merge ) {
            return stcFnPure( function ( rt, a ) {
                return new StcFn( function ( rt, b ) {
                    if ( merge.affiliation !== "merge" )
                        throw new Error();
                    return merge.fuse( rt, a, b );
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "fuse-by-merge", function ( rt, merge ) {
            return new StcFuseByMerge( merge );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulMac( "fuse-struct",
            function ( nss, myStxDetails, body, then ) {
            
            // #GEN
            
            return structMapper( nss, body, then, function ( args ) {
                return "new StcFuseStruct( " +
                    "\"fuse-struct\", \"fuse\", " + args + " )";
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "fuse-default", function ( rt, first ) {
            return stcFnPure( function ( rt, second ) {
                return new StcFuseDefault( "fuse-default", "fuse",
                    first, second );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "fuse-by-own-method",
            function ( rt, dexableGetMethod ) {
            
            return assertValidDexable( rt, dexableGetMethod,
                function ( getMethod ) {
                
                return macLookupRet(
                    new StcFuseByOwnMethod( "fuse-by-own-method",
                        "fuse",
                        dexableGetMethod ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        effectfulFun( "fuse-fix", function ( rt, dexableUnwrap ) {
            return assertValidDexable( rt, dexableUnwrap,
                function ( unwrap ) {
                
                return macLookupRet(
                    new StcFuseFix( "fuse-fix", "fuse",
                        dexableUnwrap ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "fuse-table", function ( rt, fuseVal ) {
            return new StcFuseTable( "fuse-table", "fuse", fuseVal );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "fuse-int-by-plus", function ( rt, ignored ) {
            return new StcFuseIntByPlus();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "fuse-int-by-times", function ( rt, ignored ) {
            return new StcFuseIntByTimes();
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "call-fuse", function ( rt, fuse ) {
            return stcFnPure( function ( rt, a ) {
                return new StcFn( function ( rt, b ) {
                    if ( fuse.affiliation !== "fuse" )
                        throw new Error();
                    return fuse.fuse( rt, a, b );
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "table-empty", function ( rt, ignored ) {
            return new StcForeign( "table", jsnMap() );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "table-shadow", function ( rt, dexableKey ) {
            return stcFnPure( function ( rt, maybeVal ) {
                return new StcFn( function ( rt, table ) {
                    if ( !(table instanceof StcForeign
                        && table.purpose === "table") )
                        throw new Error();
                    
                    return assertValidDexable( rt, dexableKey,
                        function ( key ) {
                        
                        if ( stcNil.tags( maybeVal ) )
                            return macLookupRet(
                                new StcForeign( "table",
                                    table.foreignVal.minusEntry( key.toName() ) ) );
                        if ( stcYep.tags( maybeVal ) )
                            return macLookupRet(
                                new StcForeign( "table",
                                    table.foreignVal.plusEntry( key.toName(),
                                        stcYep.getProj( maybeVal, "val" ) ) ) );
                        throw new Error();
                    } );
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "table-get", function ( rt, dexableKey ) {
            return new StcFn( function ( rt, table ) {
                if ( !(table instanceof StcForeign
                    && table.purpose === "table") )
                    throw new Error();
                
                return assertValidDexable( rt, dexableKey,
                    function ( key ) {
                    
                    var k = key.toName();
                    
                    if ( table.foreignVal.has( k ) )
                        return macLookupRet(
                            stcYep.ofNow(
                                table.foreignVal.get( k ) ) );
                    else
                        return macLookupRet( stcNil.ofNow() );
                } );
            } );
        } );
        
        fun( "table-zip", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                return new StcFn( function ( rt, combiner ) {
                    if ( !(a instanceof StcForeign
                        && a.purpose === "table") )
                        throw new Error();
                    if ( !(b instanceof StcForeign
                        && b.purpose === "table") )
                        throw new Error();
                    
                    var entries = [];
                    a.foreignVal.plus( b.foreignVal ).each(
                        function ( k, v ) {
                        
                        function get( table ) {
                            var v = table.get( k );
                            return v === void 0 ?
                                stcNil.ofNow() :
                                stcYep.ofNow( v );
                        }
                        entries.push(
                            { k: k, a: get( a ), b: get( b ) } );
                    } );
                    var n = entries.length;
                    return loop( 0, jsnMap() );
                    function loop( i, table ) {
                        if ( n <= i )
                            return macLookupRet(
                                new StcForeign( "table", table ) );
                        var entry = entries[ i ];
                        return macLookupThen(
                            callStcMulti( rt, combiner,
                                entry.a, entry.b ),
                            function ( v ) {
                            
                            if ( stcNil.tags( v ) )
                                return loop( i + 1, table );
                            else if ( stcYep.tags( v ) )
                                return loop( i + 1,
                                    table.plusEntry( entry.k, stcYep.getProj( v, "val" ) ) );
                            else
                                throw new Error();
                        } );
                    }
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "table-get-singleton", function ( rt, table ) {
            if ( !(table instanceof StcForeign
                && table.purpose === "table") )
                throw new Error();
            
            var foundResult = false;
            var result = null;
            table.foreignVal.each( function ( k, v ) {
                if ( foundResult )
                    throw new Error();
                foundResult = true;
                result = v;
            } );
            if ( !foundResult )
                throw new Error();
            return result;
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "table-fuse", function ( rt, table ) {
            return stcFnPure( function ( rt, init ) {
                return new StcFn( function ( rt, fuse ) {
                    if ( !(table instanceof StcForeign
                        && table.purpose === "table") )
                        throw new Error();
                    if ( fuse.affiliation !== "fuse" )
                        throw new Error();
                    
                    var vals = [];
                    table.foreignVal.each( function ( k, v ) {
                        vals.push( v );
                    } );
                    var n = vals.length;
                    return loop( 0, init );
                    function loop( i, state ) {
                        if ( n <= i )
                            return macLookupRet( state );
                        return macLookupThen(
                            fuse.fuse( rt, state, vals[ i ] ),
                            function ( state ) {
                            
                            if ( !stcYep.tags( state ) )
                                return macLookupRet( stcNil.ofNow() );
                            
                            return loop( i + 1,
                                stcYep.getProj( state, "val" ) );
                        } );
                    }
                } );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "int-zero", function ( rt, ignored ) {
            return stcForeignInt( 0 );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "int-one", function ( rt, ignored ) {
            return stcForeignInt( 1 );
        } );
        
        // TODO: Add documentation of this somewhere.
        //
        // TODO: See if we should make this available as a dex
        // (becoming the first dex with a visible order to it) or as a
        // merge (in the form of a max or min operation).
        //
        fun( "int-compare", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "int") )
                    throw new Error();
                if ( !(b instanceof StcForeign
                    && b.purpose === "int") )
                    throw new Error();
                
                if ( a.foreignVal < b.foreignVal )
                    return stcYep.ofNow( stcNil.ofNow() );
                else if ( b.foreignVal < a.foreignVal )
                    return stcNope.ofNow( stcNil.ofNow() );
                else
                    return stcNil.ofNow();
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "int-minus", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "int") )
                    throw new Error();
                if ( !(b instanceof StcForeign
                    && b.purpose === "int") )
                    throw new Error();
                return stcForeignInt( a.foreignVal - b.foreignVal );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "int-div-rounded-down", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "int") )
                    throw new Error();
                if ( !(b instanceof StcForeign
                    && b.purpose === "int") )
                    throw new Error();
                
                if ( b.foreignVal === 0 )
                    return stcNil.ofNow();
                
                var div = Math.floor( a.foreignVal / b.foreignVal );
                var mod = a.foreignVal - div * b.foreignVal;
                return stcCarried.ofNow(
                    stcForeignInt( div ),
                    stcForeignInt( mod ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "string-length", function ( rt, string ) {
            var stringInternal = parseString( string ).paddedStr;
            if ( stringInternal.length % 2 !== 0 )
                throw new Error();
            return stcForeignInt( stringInternal.length / 2 );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "string-empty", function ( rt, ignored ) {
            return stcForeignStrFromJs( "" );
        } );
        
        // TODO: Add documentation of this somewhere.
        fun( "string-singleton", function ( rt, unicodeScalar ) {
            if ( !(unicodeScalar instanceof StcForeign
                && unicodeScalar.purpose === "int") )
                throw new Error();
            
            var result = unicodeCodePointToString( unicodeScalar );
            if ( result === null )
                throw new Error();
            
            return stcForeignStrFromJs( result );
        } );
        
        function callStcLater( rt, func, arg ) {
            return new StcForeign( "effects", function ( rawMode ) {
                if ( rawMode.type !== "macro" )
                    throw new Error();
                collectDefer( rawMode, rawMode.contributingOnlyTo,
                    function () {
                    
                    return func.callStc( rt, arg );
                } );
                return macLookupRet( stcNil.ofNow() );
            } );
        }
        
        // TODO: Add documentation of this somewhere.
        fun( "string-cut-later", function ( rt, string ) {
            return stcFnPure( function ( rt, start ) {
                return stcFnPure( function ( rt, stop ) {
                    return stcFnPure( function ( rt, then ) {
                        
                        var stringInternal =
                            parseString( string ).paddedStr;
                        
                        if ( !(start instanceof StcForeign
                            && start.purpose === "int") )
                            throw new Error();
                        if ( !(stop instanceof StcForeign
                            && stop.purpose === "int") )
                            throw new Error();
                        
                        if ( !(0 <= start
                            && start <= stop
                            && stop * 2 <= stringInternal.length) )
                            throw new Error();
                        
                        return callStcLater( rt, then,
                            stcForeignStrFromPadded(
                                stringInternal.substring(
                                    start * 2, stop * 2 ) ) );
                    } );
                } );
            } );
        } );
        
        function parseSingleUnicodeScalar( string ) {
            var parsedString = parseString( string );
            if ( parsedString.paddedStr.length !== 2 )
                throw new Error();
            
            return anyUnicodeCodePoint( parsedString.jsStr,
                function ( codePointInfo ) {
                
                return { val: codePointInfo.codePoint };
            } ).val;
        }
        
        // TODO: Add documentation of this somewhere.
        fun( "string-get-unicode-scalar-later",
            function ( rt, string ) {
            
            return stcFnPure( function ( rt, start ) {
                return stcFnPure( function ( rt, then ) {
                    
                    var stringInternal =
                        parseString( string ).paddedStr;
                    
                    if ( !(start instanceof StcForeign
                        && start.purpose === "int") )
                        throw new Error();
                    
                    if ( !(0 <= start
                        && start * 2 < stringInternal.length) )
                        throw new Error();
                    
                    return callStcLater( rt, then,
                        stcForeignInt(
                            parseSingleUnicodeScalar(
                                stcForeignStrFromPadded(
                                    stringInternal.substring(
                                        start * 2, (start + 1) * 2 )
                                ) ) ) );
                } );
            } );
        } );
        
        fun( "string-append-later", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                return stcFnPure( function ( rt, then ) {
                    var aInternal = parseString( a ).paddedStr;
                    var bInternal = parseString( b ).paddedStr;
                    
                    return callStcLater( rt, then,
                        stcForeignStrFromPadded(
                            aInternal + bInternal ) );
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-zero-give-up", function ( rt, ignored ) {
            return new StcForeign( "finite-regex", {
                length: 0,
                compile: function () {
                    return {
                        jsRegexes: []
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-zero", function ( rt, ignored ) {
            return new StcForeign( "finite-regex", {
                length: 0,
                compile: function () {
                    return {
                        jsRegexes: [ [] ]
                    };
                }
            } );
        } );
        
        function escapeRegex( jsStr ) {
            return jsStr.replace( /[\\^$.|?*+()[\]{}]/g, "\\$&" );
        }
        function escapeRegexCharacterSet( jsStr ) {
            return jsStr.replace( /[\\^-[\]]/g, "\\$&" );
        }
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-one-in-string", function ( rt, string ) {
            var stringInternal = parseString( string ).paddedStr;
            
            return new StcForeign( "finite-regex", {
                length: 1,
                compile: function () {
                    return {
                        jsRegexes: [ [ "(?:[^\d\D]" +
                            stringInternal.replace( /[\d\D][\d\D]/g,
                                function (
                                    scalarStr, i, stringInternal ) {
                                
                                return "|" + escapeRegex( scalarStr );
                            } ) +
                        ")" ] ]
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-one-in-range", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                var aScalar = parseSingleUnicodeScalar( a );
                var bScalar = parseSingleUnicodeScalar( b );
                
                if ( !(aScalar <= bScalar) )
                    throw new Error();
                
                var aParsed = parseString( a ).paddedStr;
                var bParsed = parseString( b ).paddedStr;
                var a0 = aParsed.charAt( 0 );
                var a1 = aParsed.charAt( 1 );
                var b0 = bParsed.charAt( 0 );
                var b1 = bParsed.charAt( 1 );
                
                return new StcForeign( "finite-regex", {
                    length: 1,
                    compile: function () {
                        return {
                            jsRegexes: [ [ a0 === b0 ?
                                escapeRegex( a0 ) +
                                    (a1 === b1 ?
                                        escapeRegex( a1 ) :
                                        "[" + escapeRegexCharacterSet( a1 ) + "-" +
                                            escapeRegexCharacterSet( b1 ) + "]") :
                                "(?:" + escapeRegex( a0 ) +
                                    "[" + escapeRegexCharacterSet( a1 ) + "-\uFFFF]|" +
                                    (a0 + 1 === b0 ? "" :
                                        "[" + escapeRegexCharacterSet( a0 + 1 ) + "-" +
                                            escapeRegexCharacterSet( b0 - 1 ) + "][\d\D]|") +
                                    escapeRegex( a1 ) + "[\x00-" + escapeRegexCharacterSet( b1 ) + "])"
                            ] ]
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-one", function ( rt, ignored ) {
            return new StcForeign( "finite-regex", {
                length: 1,
                compile: function () {
                    return {
                        jsRegexes: [ [ "[\d\D]{2}" ] ]
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-one-not", function ( rt, finiteRegex ) {
            if ( !(finiteRegex instanceof StcForeign
                && finiteRegex.purpose === "finite-regex") )
                throw new Error();
            var finiteRegexInternal = finiteRegex.foreignVal;
            var finiteRegexFunc = finiteRegexInternal.compile;
            
            return new StcForeign( "finite-regex", {
                length: 1,
                compile: function () {
                    var subResult = finiteRegexFunc();
                    
                    return {
                        jsRegexes: [ [
                            arrMap( subResult.jsRegexes,
                                function ( r ) {
                                
                                return "(?!" + r[ 0 ] + ")";
                            } ).join( "" ) + "[\d\D]{2}"
                        ] ]
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-and", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "finite-regex") )
                    throw new Error();
                var aInternal = a.foreignVal;
                var aFunc = aInternal.compile;
                if ( !(b instanceof StcForeign
                    && b.purpose === "finite-regex") )
                    throw new Error();
                var bInternal = b.foreignVal;
                var bFunc = bInternal.compile;
                
                if ( aInternal.length !== bInternal.length )
                    throw new Error();
                
                return new StcForeign( "finite-regex", {
                    length: aInternal.length,
                    compile: function () {
                        var aResult = aFunc();
                        var bResult = bFunc();
                        
                        return {
                            jsRegexes:
                                arrMappend( aResult.jsRegexes,
                                    function ( a ) {
                                return arrMappend( bResult.jsRegexes,
                                    function ( b ) {
                                
                                var jsRegexes = [];
                                for ( var i = 0; i < n; i++ )
                                    jsRegexes.push( "(?=" + a[ i ] + ")" + b[ i ] );
                                return [ jsRegexes ];
                                
                                } );
                                } )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-or", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "finite-regex") )
                    throw new Error();
                var aInternal = a.foreignVal;
                var aFunc = aInternal.compile;
                if ( !(b instanceof StcForeign
                    && b.purpose === "finite-regex") )
                    throw new Error();
                var bInternal = b.foreignVal;
                var bFunc = bInternal.compile;
                
                if ( aInternal.length !== bInternal.length )
                    throw new Error();
                
                return new StcForeign( "finite-regex", {
                    length: aInternal.length,
                    compile: function () {
                        var aResult = aFunc();
                        var bResult = bFunc();
                        
                        return {
                            jsRegexes: [].concat(
                                aResult.jsRegexes,
                                bResult.jsRegexes )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "finite-regex-then", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "finite-regex") )
                    throw new Error();
                var aInternal = a.foreignVal;
                var aFunc = aInternal.compile;
                if ( !(b instanceof StcForeign
                    && b.purpose === "finite-regex") )
                    throw new Error();
                var bInternal = b.foreignVal;
                var bFunc = bInternal.compile;
                
                return new StcForeign( "finite-regex", {
                    length: aInternal.length + bInternal.length,
                    compile: function () {
                        var aResult = aFunc();
                        var bResult = bFunc();
                        
                        return {
                            jsRegexes:
                                arrMappend( aResult.jsRegexes,
                                    function ( a ) {
                                return arrMappend( bResult.jsRegexes,
                                    function ( b ) {
                                
                                return [ [].concat( a, b ) ];
                                
                                } );
                                } )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "suspendable-regex-finite",
            function ( rt, finiteRegex ) {
            
            if ( !(finiteRegex instanceof StcForeign
                && finiteRegex.purpose === "finite-regex") )
                throw new Error();
            var finiteRegexInternal = finiteRegex.foreignVal;
            var finiteRegexFunc = finiteRegexInternal.compile;
            
            return new StcForeign( "suspendable-regex", {
                compile: function () {
                    var subResult = finiteRegexFunc();
                    
                    return {
                        jsRegexes: arrMap( subResult.jsRegexes,
                            function ( r ) {
                            
                            return {
                                finitePart: r,
                                repeatPart: []
                            };
                        } )
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "suspendable-regex-repeat",
            function ( rt, finiteRegex ) {
            
            if ( !(finiteRegex instanceof StcForeign
                && finiteRegex.purpose === "finite-regex") )
                throw new Error();
            var finiteRegexInternal = finiteRegex.foreignVal;
            var finiteRegexFunc = finiteRegexInternal.compile;
            
            return new StcForeign( "suspendable-regex", {
                compile: function () {
                    var subResult = finiteRegexFunc();
                    
                    return {
                        jsRegexes: arrMap( subResult.jsRegexes,
                            function ( r ) {
                            
                            return {
                                finitePart: [],
                                repeatPart: r
                            };
                        } )
                    };
                }
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "suspendable-regex-and", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "suspendable-regex") )
                    throw new Error();
                var aInternal = a.foreignVal;
                var aFunc = aInternal.compile;
                if ( !(b instanceof StcForeign
                    && b.purpose === "suspendable-regex") )
                    throw new Error();
                var bInternal = b.foreignVal;
                var bFunc = bInternal.compile;
                
                return new StcForeign( "suspendable-regex", {
                    compile: function () {
                        var aResult = aFunc();
                        var bResult = bFunc();
                        
                        return {
                            jsRegexes:
                                arrMappend( aResult.jsRegexes,
                                    function ( a ) {
                                return arrMappend( bResult.jsRegexes,
                                    function ( b ) {
                                
                                function andI( i ) {
                                    function getFrom( side ) {
                                        var n = side.finitePart.length;
                                        return i < n ? side.finitePart[ i ] :
                                            side.repeatPart[ (i - n) % side.repeatPart.length ];
                                    }
                                    return "(?=" + getFrom( a ) + ")" + getIFrom( b );
                                }
                                
                                var newFiniteLength = Math.max(
                                    a.finitePart.length,
                                    b.finitePart.length );
                                
                                function gcd( a, b ) {
                                    var currentA = a;
                                    var currentB = b;
                                    while ( true ) {
                                        if ( currentA < currentB ) {
                                            currentB %= currentA;
                                        } else if ( currentB < currentA ) {
                                            currentA %= currentB;
                                        } else {
                                            return currentA;
                                        }
                                    }
                                }
                                function lcm( a, b ) {
                                    return a / gcd( a, b ) * b;
                                }
                                var newRepeatLength =
                                    lcm( a.repeatPart.length, b.repeatPart.length );
                                
                                var finitePart = [];
                                for ( var i = 0;
                                    i < newFiniteLength; i++ )
                                    finitePart.push( andI( i ) );
                                
                                var repeatPart = [];
                                for ( var i = 0;
                                    i < newRepeatLength; i++ )
                                    repeatPart.push( andI( newFiniteLength + i ) );
                                
                                return [ {
                                    finitePart: finitePart,
                                    repeatPart: repeatpart
                                } ];
                                
                                } );
                                } )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "suspendable-regex-or", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "suspendable-regex") )
                    throw new Error();
                var aInternal = a.foreignVal;
                var aFunc = aInternal.compile;
                if ( !(b instanceof StcForeign
                    && b.purpose === "suspendable-regex") )
                    throw new Error();
                var bInternal = b.foreignVal;
                var bFunc = bInternal.compile;
                
                if ( aInternal.length !== bInternal.length )
                    throw new Error();
                
                return new StcForeign( "suspendable-regex", {
                    compile: function () {
                        var aResult = aFunc();
                        var bResult = bFunc();
                        
                        return {
                            jsRegexes: [].concat(
                                aResult.jsRegexes,
                                bResult.jsRegexes )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "suspendable-regex-then",
            function ( rt, finiteRegex ) {
            
            return stcFnPure( function ( rt, suspendableRegex ) {
                
                if ( !(finiteRegex instanceof StcForeign
                    && finiteRegex.purpose === "finite-regex") )
                    throw new Error();
                var finiteRegexInternal = finiteRegex.foreignVal;
                var finiteRegexFunc = finiteRegexInternal.compile;
                
                if ( !(suspendableRegex instanceof StcForeign
                    && suspendableRegex.purpose ===
                        "suspendable-regex") )
                    throw new Error();
                var suspendableRegexInternal =
                    suspendableRegex.foreignVal;
                var suspendableRegexFunc =
                    suspendableRegexInternal.compile;
                
                return new StcForeign( "suspendable-regex", {
                    compile: function () {
                        var finiteResult = finiteRegexFunc();
                        var suspendableResult =
                            suspendableRegexFunc();
                        
                        return {
                            jsRegexes:
                                arrMappend( finiteResult.jsRegexes,
                                    function ( f ) {
                                return arrMappend(
                                    suspendableResult.jsRegexes,
                                    function ( s ) {
                                
                                return [ {
                                    finitePart: [].concat( f, s.finitePart ),
                                    repeatPart: s.repeatPart
                                } ];
                                
                                } );
                                } )
                        };
                    }
                } );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        fun( "optimize-suspendable-regex-later",
            function ( rt, suspendableRegex ) {
            
            return stcFnPure( function ( rt, then ) {
                if ( !(suspendableRegex instanceof StcForeign
                    && suspendableRegex.purpose ===
                        "suspendable-regex") )
                    throw new Error();
                var suspendableRegexInternal =
                    suspendableRegex.foreignVal;
                var suspendableRegexFunc =
                    suspendableRegexInternal.compile;
                
                return callStcLater( rt, then,
                    new StcForeign( "optimized-suspendable-regex",
                        suspendableRegexFunc().jsRegexes ) );
            } );
        } );
        
        // TODO: Document this using the comment in
        // era-cene-prelude.cene.
        // TODO: Implement this properly.
        fun( "optimized-suspendable-regex-match-later",
            function ( rt, regex ) {
            
            return stcFnPure( function ( rt, string ) {
                return stcFnPure( function ( rt, start ) {
                    return stcFnPure( function ( rt, then ) {
                        
                        if ( !(regex instanceof StcForeign
                            && regex.purpose ===
                                "optimized-suspendable-regex") )
                            throw new Error();
                        var regexInternal = regex.foreignVal;
                        
                        var stringInternal =
                            parseString( string ).paddedStr;
                        
                        if ( !(start instanceof StcForeign
                            && start.purpose === "int") )
                            throw new Error();
                        var startInternal = start.foreignVal;
                        
                        if ( !(0 <= start
                            && start * 2 <= stringInternal.length) )
                            throw new Error();
                        
                        function regexesToChain( regexes ) {
                            return regexes.join( "" );
                        }
                        function regexesToOptionalChain( regexes ) {
                            var result = "";
                            for ( var i = regexes.length - 1; 0 <= i; i-- )
                                result =
                                    "(?:" + regexes[ i ] + result + ")?";
                            return result;
                        }
                        function finiteAndRepeatPartsToRegex(
                            parts ) {
                            
                            return new RegExp(
                                regexesToOptionalChain( [].concat(
                                    parts.finitePart,
                                    [ parts.repeatPart.length === 0 ?
                                        "()" :
                                        "((?:" + regexesToChain( parts.repeatPart ) + ")*)" +
                                            regexesToOptionalChain( parts.repeatPart ) ]
                                ) ) );
                        }
                        
                        var start2 = start * 2;
                        var newRegexInternal = [];
                        arrEach( regexInternal, function ( parts ) {
                            var jsRegex =
                                finiteAndRepeatPartsToRegex( parts );
                            jsRegex.lastIndex = start2;
                            var match =
                                jsRegex.exec( stringInternal );
                            var stop2 = start2 + match[ 0 ].length;
                            var finished = match[ 1 ] !== void 0 &&
                                match[ 1 ].length === 0;
                            
                            if ( stop2 === stringInternal.length ) {
                                // TODO: Implement this.
                            } else {
                                // TODO: Implement this.
                            }
                        } );
                        
                        // TODO: Implement this.
                        var result = stcNil.ofNow();
                        
                        return callStcLater( rt, then,
                            result );
                    } );
                } );
            } );
        } );
        
        fun( "make-tuple-tag", function ( rt, tupleName ) {
            return stcFnPure( function ( rt, projNames ) {
                var tupleStringyName = stxToMaybeName( tupleName );
                if ( tupleStringyName === null )
                    throw new Error();
                if ( typeof tupleStringyName === "string" )
                    throw new Error();
                var projStringyNames = mapConsListToArr( projNames,
                    function ( projName ) {
                        var projStringyName =
                            stxToMaybeName( projStringyName );
                        if ( projStringyName === null )
                            throw new Error();
                        if ( typeof projStringyName === "string" )
                            throw new Error();
                        return projStringyName;
                    } );
                return new StcForeign( "name",
                    stcNameTupleTagAlreadySorted(
                        stcConstructorTag( macroDefNs,
                            tupleStringyName ),
                        projStringyNames.sort( function ( a, b ) {
                            return nameCompare( a, b );
                        } ) ) );
            } );
        } );
        
        // TODO: Add documentation of this somewhere.
        // NOTE: This is the only way to establish a function behavior
        // for a struct that has more than zero projections.
        fun( "function-implementation-opaque", function ( rt, impl ) {
            return new StcForeign( "native-definition",
                function ( rt, funcVal, argVal ) {
                
                return callStcMulti( rt, impl, funcVal, argVal );
            } );
        } );
        
        fun( "macro-stx-details", function ( rt, mode ) {
            return stcFnPure( function ( rt, uniqueNs ) {
                return stcFnPure( function ( rt, definitionNs ) {
                    return stcFnPure( function ( rt, stx ) {
                        return stcTrivialStxDetails();
                    } );
                } );
            } );
        } );
        
        fun( "contributing-only-to", function ( rt, ns ) {
            return stcFnPure( function ( rt, effects ) {
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                if ( !(effects instanceof StcForeign
                    && effects.purpose === "effects") )
                    throw new Error();
                
                return new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    if ( rawMode.type !== "macro" )
                        throw new Error();
                    collectDefer( rawMode,
                        stcNameSetIntersection(
                            rawMode.contributingOnlyTo,
                            stcNameSetNsDescendants(
                                ns.foreignVal ) ),
                        function () {
                        
                        return macLookupRet( effects );
                    } );
                    return macLookupRet( stcNil.ofNow() );
                } );
            } );
        } );
        
        fun( "procure-sub-ns-table", function ( rt, table ) {
            return new StcFn( function ( rt, ns ) {
                if ( !(table instanceof StcForeign
                    && table.purpose === "table") )
                    throw new Error();
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return macLookupRet(
                    new StcForeign( "table",
                        table.foreignVal.map( function ( v, k ) {
                            return new StcForeign( "ns",
                                stcNsGet( k, ns.foreignVal ) );
                        } ) ) );
            } );
        } );
        
        fun( "shadow-procure-sub-ns-table", function ( rt, table ) {
            return new StcFn( function ( rt, ns ) {
                if ( !(table instanceof StcForeign
                    && table.purpose === "table") )
                    throw new Error();
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                var result = ns.foreignVal;
                
                table.each( function ( k, subNs ) {
                    if ( !(subNs instanceof StcForeign
                        && subNs.purpose === "ns") )
                        throw new Error();
                    result =
                        stcNsShadow( k, subNs.foreignVal, result );
                } );
                
                return macLookupRet( new StcForeign( "ns", result ) );
            } );
        } );
        
        fun( "procure-name", function ( rt, mode ) {
            return stcFnPure( function ( rt, ns ) {
                if ( !(mode instanceof StcForeign
                    && mode.purpose === "mode"
                    && mode.foreignVal.current
                    && mode.foreignVal.type === "macro") )
                    throw new Error();
                
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return new StcForeign( "name", ns.foreignVal.name );
            } );
        } );
        
        fun( "procure-defined", function ( rt, mode ) {
            return new StcFn( function ( rt, ns ) {
                if ( !(mode instanceof StcForeign
                    && mode.purpose === "mode"
                    && mode.foreignVal.current
                    && mode.foreignVal.type === "macro") )
                    throw new Error();
                
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return macLookupGet( nsToDefiner( ns.foreignVal ),
                    function () {
                        throw new Error(
                            "No such defined value: " +
                            JSON.stringify( ns.foreignVal.name ) );
                    } );
            } );
        } );
        
        fun( "procure-definer", function ( rt, ns ) {
            if ( !(ns instanceof StcForeign
                && ns.purpose === "ns") )
                throw new Error();
            
            return new StcForeign( "definer",
                nsToDefiner( ns.foreignVal ) );
        } );
        
        fun( "procure-contribute-element", function ( rt, ns ) {
            return stcFnPure( function ( rt, dexableKey ) {
                return new StcFn( function ( rt, element ) {
                    if ( !(ns instanceof StcForeign
                        && ns.purpose === "ns") )
                        throw new Error();
                    
                    return assertValidDexable( rt, dexableKey,
                        function ( key ) {
                        
                        return macLookupRet(
                            new StcForeign( "effects",
                                function ( rawMode ) {
                            
                            if ( rawMode.type !== "macro" )
                                throw new Error();
                            
                            collectPutElement( rawMode, ns.foreignVal,
                                key.toName(), element );
                            return macLookupRet( stcNil.ofNow() );
                        } ) );
                    } );
                } );
            } );
        } );
        
        fun( "procure-contribute-listener", function ( rt, ns ) {
            return stcFnPure( function ( rt, dexableKey ) {
                return new StcFn( function ( rt, listener ) {
                    if ( !(ns instanceof StcForeign
                        && ns.purpose === "ns") )
                        throw new Error();
                    
                    return assertValidDexable( rt, dexableKey,
                        function ( key ) {
                        
                        return macLookupRet(
                            new StcForeign( "effects",
                                function ( rawMode ) {
                            
                            if ( rawMode.type !== "macro" )
                                throw new Error();
                            
                            collectPutListener( rawMode,
                                ns.foreignVal,
                                key.toName(), listener );
                            return macLookupRet( stcNil.ofNow() );
                        } ) );
                    } );
                } );
            } );
        } );
        
        fun( "procure-contributed-elements", function ( rt, mode ) {
            return new StcFn( function ( rt, ns ) {
                if ( !(mode instanceof StcForeign
                    && mode.purpose === "mode"
                    && mode.foreignVal.current
                    && mode.foreignVal.type === "macro") )
                    throw new Error();
                
                if ( !(ns instanceof StcForeign
                    && ns.purpose === "ns") )
                    throw new Error();
                
                return macLookupProcureContributedElements(
                    ns.foreignVal.name,
                    function () {
                        throw new Error(
                            "No such defined value: " +
                            JSON.stringify( ns.foreignVal.name ) );
                    } );
            } );
        } );
        
        fun( "no-effects", function ( rt, ignored ) {
            return new StcForeign( "effects", function ( rawMode ) {
                return macLookupRet( stcNil.ofNow() );
            } );
        } );
        
        fun( "join-effects", function ( rt, a ) {
            return stcFnPure( function ( rt, b ) {
                if ( !(a instanceof StcForeign
                    && a.purpose === "effects") )
                    throw new Error();
                var aFunc = a.foreignVal;
                if ( !(b instanceof StcForeign
                    && b.purpose === "effects") )
                    throw new Error();
                var bFunc = b.foreignVal;
                
                return new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    return macLookupThen( aFunc( rawMode ),
                        function ( ignored ) {
                        
                        return bFunc( rawMode );
                    } );
                } );
            } );
        } );
        
        fun( "later", function ( rt, effects ) {
            if ( !(effects instanceof StcForeign
                && effects.purpose === "effects") )
                throw new Error();
            
            return new StcForeign( "effects", function ( rawMode ) {
                if ( rawMode.type !== "macro" )
                    throw new Error();
                collectDefer( rawMode, rawMode.contributingOnlyTo,
                    function () {
                    
                    return macLookupRet( effects );
                } );
                return macLookupRet( stcNil.ofNow() );
            } );
        } );
        
        fun( "make-promise-later", function ( rt, then ) {
            var definer =
                { type: "object", visited: false, value: null };
            
            return new StcForeign( "effects",
                function ( rawMode ) {
                
                if ( rawMode.type !== "macro" )
                    throw new Error();
                collectDefer( rawMode,
                    rawMode.contributingOnlyTo,
                    function () {
                    
                    return callStcMulti( rt, then,
                        new StcForeign( "definer", definer ),
                        new StcFn( function ( rt, ignored ) {
                            return macLookupGet( definer,
                                function () {
                                    throw new Error( "Never fulfilled a promise" );
                                } );
                        } ) );
                } );
                return macLookupRet( stcNil.ofNow() );
            } );
        } );
        
        fun( "definer-define", function ( rt, definer ) {
            return stcFnPure( function ( rt, value ) {
                if ( !(definer instanceof StcForeign
                    && definer.purpose === "definer") )
                    throw new Error();
                
                return new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    if ( rawMode.type !== "macro" )
                        throw new Error();
                    
                    collectPutDefined( rawMode, definer.foreignVal,
                        value );
                    return macLookupRet( stcNil.ofNow() );
                } );
            } );
        } );
        
        fun( "assert-current-modality", function ( rt, mode ) {
            if ( !(mode instanceof StcForeign
                && mode.purpose === "mode"
                && mode.foreignVal.current) )
                throw new Error();
            return stcNil.ofNow();
        } );
        
        fun( "compile-expression", function ( rt, uniqueNs ) {
            return stcFnPure( function ( rt, definitionNs ) {
                return stcFnPure( function ( rt, stx ) {
                    return stcFnPure( function ( rt, outDefiner ) {
                        if ( !(uniqueNs instanceof StcForeign
                            && uniqueNs.purpose === "ns") )
                            throw new Error();
                        
                        if ( !(definitionNs instanceof StcForeign
                            && definitionNs.purpose === "ns") )
                            throw new Error();
                        
                        if ( !(outDefiner instanceof StcForeign
                            && outDefiner.purpose === "definer") )
                            throw new Error();
                        
                        return new StcForeign( "effects",
                            function ( rawMode ) {
                            
                            if ( !(rawMode.current
                                && rawMode.type === "macro") )
                                throw new Error();
                            
                            return macroexpandToDefiner( {
                                definitionNs: definitionNs.foreignVal,
                                uniqueNs: uniqueNs.foreignVal
                            }, rawMode, stx, outDefiner.foreignVal );
                        } );
                    } );
                } );
            } );
        } );
        
        fun( "get-mode", function ( rt, body ) {
            return new StcForeign( "effects", function ( rawMode ) {
                return macLookupThenRunEffects( rawMode,
                    body.callStc( rt,
                        new StcForeign( "mode", rawMode ) ) );
            } );
        } );
        
        fun( "read-all-force", function ( rt, string ) {
            return stcArrayToConsList( arrMap(
                readAll( parseString( string ).jsStr ),
                function ( tryExpr ) {
                
                if ( !tryExpr.ok )
                    throw new Error( tryExpr.msg );
                
                return readerExprToStc(
                    stcTrivialStxDetails(), tryExpr.val );
            } ) );
        } );
        
        commitDummyMode( namespaceDefs, dummyMode );
    }
    
    function macroexpandToDefiner(
        nss, rawMode, locatedExpr, outDefiner ) {
        
        // #GEN
        if ( rawMode.type !== "macro" )
            throw new Error();
        collectDefer( rawMode, rawMode.contributingOnlyTo,
            function () {
            
            var identifier = stxToMaybeName( locatedExpr );
            if ( identifier !== null )
                return macLookupRet( new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    // TODO: Report better errors if an unbound local
                    // variable is used. Currently, we just generate
                    // the JavaScript code for the variable anyway.
                    collectPutDefined( rawMode, outDefiner,
                        new StcForeign( "compiled-code",
                            "macLookupRet( " +
                                stcIdentifier(
                                    identifier ) + " )" ) );
                    return macLookupRet( stcNil.ofNow() );
                } ) );
            if ( !stcStx.tags( locatedExpr ) )
                throw new Error();
            var sExpr = stcStx.getProj( locatedExpr, "s-expr" );
            if ( !stcCons.tags( sExpr ) )
                throw new Error();
            var macroNameStx = stcCons.getProj( sExpr, "car" );
            var macroName = stxToMaybeName( macroNameStx );
            if ( macroName === null )
                throw new Error();
            var resolvedMacroName =
                stcMacroName( nss.definitionNs, macroName );
            
            return macLookupThen(
                macLookupGet(
                    nsToDefiner(
                        stcNsGet( "function",
                            stcNsGet( resolvedMacroName,
                                stcNsGet( "macros",
                                    nss.definitionNs ) ) ) ),
                    function () {
                        throw new Error(
                            "No such macro: " +
                            JSON.stringify( macroName ) );
                    } ),
                function ( macroFunction ) {
            
            return callStcMulti( rt, macroFunction,
                new StcForeign( "ns", nss.uniqueNs ),
                new StcForeign( "ns", nss.definitionNs ),
                stcTrivialStxDetails(),
                stcCons.getProj( sExpr, "cdr" ),
                stcFnPure( function ( rt, macroResult ) {
                    return new StcForeign( "effects",
                        function ( rawMode ) {
                        
                        collectPutDefined( rawMode, outDefiner,
                            macroResult );
                        return macLookupRet( stcNil.ofNow() );
                    } );
                } ) );
            
            } );
        } );
        
        return macLookupRet( stcNil.ofNow() );
    }
    
    function macroexpand( nss, rawMode, locatedExpr, outNs, then ) {
        if ( rawMode.type !== "macro" )
            throw new Error();
        collectDefer( rawMode, rawMode.contributingOnlyTo,
            function () {
            
            return macLookupThen(
                macLookupGet( nsToDefiner( outNs ), function () {
                    if ( !stcStx.tags( locatedExpr ) )
                        throw new Error();
                    var sExpr =
                        stcStx.getProj( locatedExpr, "s-expr" );
                    if ( !stcCons.tags( sExpr ) )
                        throw new Error();
                    var macroNameStx =
                        stcCons.getProj( sExpr, "car" );
                    throw new Error(
                        "Macro never completed: " +
                        macroNameStx.pretty() );
                } ),
                function ( macroResult ) {
                
                if ( !(macroResult instanceof StcForeign
                    && macroResult.purpose === "compiled-code") )
                    throw new Error();
                return macLookupRet( new StcForeign( "effects",
                    function ( rawMode ) {
                    
                    return then( rawMode, macroResult.foreignVal );
                } ) );
            } );
        } );
        
        return macroexpandToDefiner( nss, rawMode, locatedExpr,
            nsToDefiner( outNs ) );
    }
    
    function processDefType(
        definitionNs, rawMode, tupleName, projNames ) {
        
        var n = projNames.length;
        var type = stcTypeArr( definitionNs, tupleName, projNames );
        var constructorName =
            stcConstructorName( definitionNs, tupleName );
        collectPutDefined( rawMode,
            nsToDefiner(
                stcNsGet( "projection-list",
                    stcNsGet( constructorName,
                        stcNsGet( "constructors",
                            definitionNs ) ) ) ),
            stcArrayToConsList( arrMap( type.unsortedProjNames,
                function ( entry ) {
                
                return new StcForeign( "name", entry.name );
            } ) ) );
        // TODO: Make this expand multiple subexpressions
        // concurrently.
        stcAddPureMacro( definitionNs, rawMode, tupleName,
            function ( nss, myStxDetails, body, then ) {
            
            return new StcForeign( "effects", function ( rawMode ) {
                return loop( rawMode, 0, null, body,
                    nssGet( nss, "projections" ) );
            } );
            
            function loop( rawMode, i, revProjVals, remainingBody,
                projectionsNss ) {
                
                if ( n <= i )
                    return next( rawMode,
                        revProjVals, remainingBody );
                
                if ( !stcCons.tags( remainingBody ) )
                    throw new Error(
                        "Expected more arguments to " +
                        JSON.stringify( tupleName ) );
                
                var firstNss = nssGet( projectionsNss, "first" );
                
                return macroexpand( nssGet( firstNss, "unique" ),
                    rawMode,
                    stcCons.getProj( remainingBody, "car" ),
                    nssGet( firstNss, "outbox" ).uniqueNs,
                    function ( rawMode, projVal ) {
                    
                    return loop( rawMode, i + 1,
                        { first: projVal, rest: revProjVals },
                        stcCons.getProj( remainingBody, "cdr" ),
                        nssGet( projectionsNss, "rest" ) );
                } );
            }
            
            function next( rawMode, revProjVals, remainingBody ) {
                return macroexpandConsListToArr(
                    nssGet( nss, "args" ),
                    rawMode,
                    remainingBody,
                    function ( rawMode, expandedArgs ) {
                    
                    return macLookupThenRunEffects( rawMode,
                        then(
                            stcCallArr(
                                type.ofArr(
                                    revJsListToArr( revProjVals ) ),
                                expandedArgs ) ) );
                } );
            }
        } );
    }
    
    function processCoreTypes( namespaceDefs, definitionNs ) {
        
        var dummyMode = makeDummyMode();
        
        function type( tupleName, projNames ) {
            processDefType(
                definitionNs, dummyMode, tupleName, projNames );
        }
        
        // These constructors are needed for interpreting the results
        // of certain built-in operators, namely `isa` and the dex
        // operations.
        type( "yep", [ "val" ] );
        type( "nope", [ "val" ] );
        
        // This constructor is needed for constructing the input to
        // certain operations.
        // TODO: Add documentation for this somewhere.
        type( "dexable", [ "dex", "val" ] );
        
        // This constructor is needed to deconstruct the result of
        // `int-div-rounded-down`.
        // TODO: Add documentation for this somewhere.
        type( "carried", [ "main", "carry" ] );
        
        // These s-expression constructors are needed so that macros
        // can parse their s-expression arguments. The `cons` and
        // `nil` constructors are also needed for parsing and
        // generating projection lists.
        type( "nil", [] );
        type( "cons", [ "car", "cdr" ] );
        type( "istring-nil", [ "string" ] );
        type( "istring-cons",
            [ "string-past", "interpolated", "istring-rest" ] );
        type( "foreign", [ "val" ] );
        
        // This constructor is needed so that macros can parse their
        // located syntax arguments.
        type( "stx", [ "stx-details", "s-expr" ] );
        
        commitDummyMode( namespaceDefs, dummyMode );
    }
    
    function readerExprToStc( myStxDetails, readerExpr ) {
        if ( readerExpr.type === "nil" ) {
            return stcStx.ofNow( myStxDetails, stcNil.ofNow() );
        } else if ( readerExpr.type === "cons" ) {
            return stcStx.ofNow( myStxDetails,
                stcCons.ofNow(
                    readerExprToStc( myStxDetails, readerExpr.first ),
                    stcStx.getProj(
                        readerExprToStc( myStxDetails,
                            readerExpr.rest ),
                        "s-expr" )
                ) );
        } else if ( readerExpr.type === "stringNil" ) {
            return stcStx.ofNow( myStxDetails,
                stcIstringNil.ofNow(
                    stcForeignStrFromJs(
                        readerStringNilToString( readerExpr ) ) ) );
        } else if ( readerExpr.type === "stringCons" ) {
            return stcStx.ofNow( myStxDetails,
                stcIstringCons.ofNow(
                    stcForeignStrFromJs(
                        readerStringListToString(
                            readerExpr.string ) ),
                    readerExprToStc( myStxDetails,
                        readerExpr.interpolation ),
                    stcStx.getProj(
                        readerExprToStc( myStxDetails,
                            readerExpr.rest ),
                        "s-expr" ) ) );
        } else {
            throw new Error();
        }
    }
    
    function topLevelTryExprsToMacLookupThreads( nss, tryExprs ) {
        var macLookupEffectsArr = [];
        var remainingNss = nss;
        arrEach( tryExprs, function ( tryExpr ) {
            if ( !tryExpr.ok )
                throw new Error( tryExpr.msg );
            
            var thisRemainingNss = remainingNss;
            
            macLookupEffectsArr.push( function ( rawMode ) {
                var firstNss = nssGet( thisRemainingNss, "first" );
                return macroexpand( nssGet( firstNss, "unique" ),
                    rawMode,
                    readerExprToStc(
                        stcTrivialStxDetails(), tryExpr.val ),
                    nssGet( firstNss, "outbox" ).uniqueNs,
                    function ( rawMode, code ) {
                    
                    return macLookupRet( null );
                } );
            } );
            
            remainingNss = nssGet( thisRemainingNss, "rest" );
        } );
        return arrMap( macLookupEffectsArr, function ( effects ) {
            return { type: "topLevelDefinitionThread",
                macLookupEffectsOfDefinitionEffects: effects };
        } );
    }
    
    function runTopLevelTryExprsSync( namespaceDefs, nss, tryExprs ) {
        runTopLevelMacLookupsSync( namespaceDefs, rt,
            topLevelTryExprsToMacLookupThreads( nss, tryExprs ) );
    }
    
    return {
        rt: rt,
        stcAddCoreMacros: stcAddCoreMacros,
        processCoreTypes: processCoreTypes,
        topLevelTryExprsToMacLookupThreads:
            topLevelTryExprsToMacLookupThreads,
        runTopLevelTryExprsSync: runTopLevelTryExprsSync,
        
        // NOTE: These are only needed for era-cene-api.js.
        processDefType: processDefType,
        stcArrayToConsList: stcArrayToConsList,
        makeDummyMode: makeDummyMode,
        commitDummyMode: commitDummyMode
    };
}
