#!/usr/bin/env node
// cene.js
// Copyright 2013-2016 Ross Angle. Released under the MIT License.
"use strict";

var fs = require( "fs" );
var $path = require( "path" );

var argparse = require( "argparse" );

var _ = require( "./buildlib/lathe" );
var ltf = require( "./buildlib/lathe-fs" );


function readFile( filename ) {
    return fs.readFileSync( filename, "UTF-8" );
}
function readInternalFiles( filenames ) {
    return filenames.map( function ( filename ) {
        return readFile( $path.resolve( __dirname, filename ) );
    } ).join( "\n\n\n" );
}

function arrEachAsyncNodeExn( arr, asyncFunc, then ) {
    loop( 0 );
    function loop( i ) {
        if ( arr.length <= i )
            return void then();
        return asyncFunc( i, arr[ i ], function ( e ) {
            if ( e ) return void then( e );
            loop( i + 1 );
        } );
    }
}


function runCeneSync(
    files, testFiles, displayTimeInfo, cliArgs, inRoot, outRoot ) {
    
    if ( inRoot !== null && outRoot !== null ) (function () {
        function check( lineage, other ) {
            if ( lineage === other )
                throw new Error(
                    "The provided input and output directories " +
                    "overlap, which is not allowed." );
            var parent = $path.dirname( lineage );
            if ( parent !== lineage )
                check( parent, other );
        }
        var resolvedIn = $path.resolve( inRoot );
        var resolvedOut = $path.resolve( outRoot );
        check( resolvedIn, resolvedOut );
        check( resolvedOut, resolvedIn );
    })();
    
    var resolvedIn = inRoot === null ? null : $path.resolve( inRoot );
    var resolvedOut =
        outRoot === null ? null : $path.resolve( outRoot );
    
    
    var $stc = Function(
        readInternalFiles( [
            "src/era-misc-strmap-avl.js",
            "src/era-misc.js",
            "src/era-reader.js",
            "src/era-staccato-lib-runner-mini.js",
            "src/era-cene-api.js"
        ] ) + "\n" +
        "\n" +
        "\n" +
        "return {\n" +
        "    readAll: readAll,\n" +
        "    arrAny: arrAny,\n" +
        "    arrAll: arrAll,\n" +
        "    arrMap: arrMap,\n" +
        "    arrEach: arrEach,\n" +
        "    jsnMap: jsnMap,\n" +
        "    stcNsGet: stcNsGet,\n" +
        "    stcNsRoot: stcNsRoot,\n" +
        "    nssGet: nssGet,\n" +
        "    runTrampoline: runTrampoline,\n" +
        "    usingDefinitionNs: usingDefinitionNs,\n" +
        "    stcTrivialStxDetails: stcTrivialStxDetails,\n" +
        "    runAllDefs: runAllDefs,\n" +
        "    ceneApiUsingDefinitionNs: ceneApiUsingDefinitionNs\n" +
        "};\n"
    )();
    
    var startMillis = new Date().getTime();
    
    var textOfFiles = $stc.arrMap( files, function ( file ) {
        return readFile( file );
    } );
    var codeOfFiles = $stc.arrMap( textOfFiles, function ( text ) {
        return $stc.readAll( text );
    } );
    var codeOfTestFiles = $stc.arrMap( testFiles, function ( file ) {
        return $stc.readAll( readFile( file ) );
    } );
    var readMillis = new Date().getTime();
    
    var nss = {
        definitionNs:
            $stc.stcNsGet( "definition-ns", $stc.stcNsRoot() ),
        uniqueNs: $stc.stcNsGet( "unique-ns", $stc.stcNsRoot() )
    };
    
    function ensureDirSync( path ) {
        if ( fs.existsSync( path ) ) {
            if ( fs.statSync( path ).isDirectory() )
                return;
            throw new Error();
        }
        var resolvedPath = $path.resolve( path );
        var parent = $path.dirname( resolvedPath );
        if ( parent === resolvedPath )
            return;
        ensureDirSync( parent );
        fs.mkdirSync( path );
    }
    function fsPathGet( dirname, basename ) {
        if ( dirname === null )
            return null;
        // TODO: See if there's anything more we need to sanitize for.
        if ( /[/\\]|^\.\.?$/.test( basename ) )
            return null;
        var result = $path.resolve( dirname, basename );
        if ( $path.basename( result ) !== basename )
            return null;
        return result;
    }
    function pathGet( dirname, basename ) {
        return {
            logicalPath: [ "get", basename, dirname.logicalPath ],
            fsPath: fsPathGet( dirname.fsPath, basename )
        };
    }
    
    var usingDefNs = $stc.usingDefinitionNs( nss.definitionNs );
    
    var memoInputPathType = $stc.jsnMap();
    var memoInputPathDirectoryList = $stc.jsnMap();
    var memoInputPathBlobUtf8 = $stc.jsnMap();
    var memoOutputPathDirectory = $stc.jsnMap();
    var memoOutputPathBlobUtf8 = $stc.jsnMap();
    var onceDependenciesCompleteListeners = [];
    function recordMemoForEnsureDir( dir ) {
        if ( memoOutputPathDirectory.has( dir ) )
            return;
        memoOutputPathDirectory.set( dir, true );
        if ( dir[ 0 ] === "get" )
            recordMemoForEnsureDir( dir[ 2 ] );
    }
    function recordMemo( memoMap, key, body ) {
        if ( !memoMap.has( key ) )
            memoMap.set( key, body() );
        return memoMap.get( key );
    }
    
    var ceneApiUsingDefNs =
        $stc.ceneApiUsingDefinitionNs( nss.definitionNs, {
            defer: function ( body ) {
                _.defer( body );
            },
            cliArguments: function () {
                return cliArgs;
            },
            cliInputDirectory: function () {
                return {
                    logicalPath: [ "in-root" ],
                    fsPath: resolvedIn
                };
            },
            cliOutputDirectory: function () {
                return {
                    logicalPath: [ "out-root" ],
                    fsPath: resolvedOut
                };
            },
            inputPathGet: function ( inputPath, name ) {
                return pathGet( inputPath, name );
            },
            inputPathType: function ( inputPath ) {
                return recordMemo(
                    memoInputPathType, inputPath.logicalPath,
                    function () {
                    
                    if ( inputPath.fsPath === null
                        || !fs.existsSync( inputPath.fsPath ) )
                        return { type: "missing" };
                    
                    var stat = fs.statSync( inputPath.fsPath );
                    if ( stat.isDirectory() )
                        return { type: "directory" };
                    else if ( stat.isFile() )
                        return { type: "blob" };
                    else
                        throw new Error();
                } );
            },
            inputPathDirectoryList: function ( inputPath ) {
                return recordMemo(
                    memoInputPathDirectoryList, inputPath.logicalPath,
                    function () {
                    
                    if ( inputPath.fsPath === null )
                        throw new Error();
                    return fs.readdirSync( inputPath.fsPath );
                } );
            },
            inputPathBlobUtf8: function ( inputPath ) {
                return recordMemo(
                    memoInputPathBlobUtf8, inputPath.logicalPath,
                    function () {
                    
                    if ( inputPath === null )
                        throw new Error();
                    return fs.readFileSync(
                        inputPath.fsPath, "utf-8" );
                } );
            },
            outputPathGet: function ( outputPath, name ) {
                return pathGet( outputPath, name );
            },
            outputPathDirectory: function ( outputPath ) {
                recordMemoForEnsureDir( outputPath.logicalPath );
                
                if ( outputPath.fsPath === null )
                    return;
                ensureDirSync( outputPath.fsPath );
            },
            outputPathBlobUtf8:
                function ( outputPath, outputString ) {
                
                if ( memoOutputPathDirectory.has(
                    outputPath.logicalPath ) )
                    throw new Error();
                if ( memoOutputPathBlobUtf8.has(
                    outputPath.logicalPath ) )
                    throw new Error();
                
                if ( outputPath.logicalPath[ 0 ] === "get" )
                    recordMemoForEnsureDir(
                        outputPath.logicalPath[ 2 ] );
                memoOutputPathBlobUtf8.set(
                    outputPath.logicalPath, true );
                
                if ( outputPath.fsPath === null )
                    return;
                var resolvedPath = $path.resolve( outputPath.fsPath );
                ensureDirSync( $path.dirname( resolvedPath ) );
                fs.writeFileSync(
                    resolvedPath, outputString, "utf-8" );
            },
            sloppyJavaScriptQuine: function ( constructorTag ) {
                // TODO: This should be the one place we create a
                // JavaScript mode without having access to one first.
                var quine =
                    readInternalFiles( [
                        "src/era-misc-strmap-avl.js",
                        "src/era-misc.js",
                        "src/era-reader.js",
                        "src/era-staccato-lib-runner-mini.js",
                        "src/era-cene-api.js",
                        "src/era-cene-quiner.js"
                    ] ) + "\n" +
                    "\n";
                
                function addMap( map, mapName ) {
                    map.each( function ( k, v ) {
                        quine += "" + mapName + ".set( " +
                            JSON.stringify( k ) + ", " +
                            JSON.stringify( v ) + " );\n"
                    } );
                }
                addMap( memoInputPathType, "quinerInputPathType" );
                addMap( memoInputPathDirectoryList,
                    "quinerInputPathDirectoryList" );
                addMap( memoInputPathBlobUtf8,
                    "quinerInputPathBlobUtf8" );
                
                $stc.arrEach( textOfFiles, function ( text ) {
                    quine += "quinerTextOfFiles.push( " +
                        JSON.stringify( text ) + " );\n";
                } );
                
                quine +=
                    "quinerCliArguments = " +
                        JSON.stringify( cliArgs ) + ";\n" +
                    "quinerQuine = quine;\n" +
                    "\n" +
                    "return {\n" +
                    "    quinerCallWithSyncJavaScriptMode:\n" +
                    "        quinerCallWithSyncJavaScriptMode\n" +
                    "};\n";
                
                return (
                    "\"strict mode\";\n" +
                    "(function () {\n" +
                    "\n" +
                    "var quine = " + JSON.stringify( quine ) + ";\n" +
                    "var quiner = " +
                        "Function( \"quine\", quine )( quine );\n" +
                    "quiner.quinerCallWithSyncJavaScriptMode( " +
                        JSON.stringify( constructorTag ) + " );\n" +
                    "\n" +
                    "})();\n"
                );
            },
            onceDependenciesComplete: function ( listener ) {
                onceDependenciesCompleteListeners.push( listener );
            }
        } );
    
    usingDefNs.stcAddCoreMacros( nss.definitionNs );
    usingDefNs.processCoreTypes( nss.definitionNs );
    ceneApiUsingDefNs.addCeneApi( nss.definitionNs );
    
    function runCode( code ) {
        return !$stc.arrAny( code, function ( tryExpr ) {
            if ( !tryExpr.ok ) {
                console.error( tryExpr.msg );
                return true;
            }
            
            var deferred = [];
            
            function defer( body ) {
                deferred.push( body );
            }
            function createNextMode( rawMode ) {
                // NOTE: This comment is here in case we do a search
                // for mode inside quotes.
                //
                // "mode"
                //
                return {
                    type: "macro",
                    finished: null,
                    current: true,
                    safe: [],
                    defer: []
                };
            }
            var rawMode = createNextMode( null );
            var done = false;
            usingDefNs.macroexpandTopLevel(
                $stc.nssGet( nss, "first" ),
                rawMode,
                usingDefNs.readerExprToStc(
                    $stc.stcTrivialStxDetails(),
                    tryExpr.val ) );
            $stc.runTrampoline( rawMode, defer, createNextMode,
                function () {
                
                done = true;
            } );
            while ( deferred.length !== 0 )
                deferred.shift()();
            if ( !done )
                throw new Error( "Not done" );
            
            nss = $stc.nssGet( nss, "rest" );
            return false;
        } );
    }
    
    if ( $stc.arrAll( codeOfFiles, function ( code ) {
        return runCode( code );
    } ) ) {
        $stc.runAllDefs();
        $stc.arrAll( codeOfTestFiles, function ( code ) {
            return runCode( code );
        } );
        $stc.arrEach( onceDependenciesCompleteListeners,
            function ( listener ) {
            
            listener();
        } );
    }
    
    var stopMillis = new Date().getTime();
    if ( displayTimeInfo ) {
        console.log(
            "Ran for " + (stopMillis - startMillis) / 1000 + " " +
            "seconds, broken down as follows:" );
        console.log(
            "- Spent " + (readMillis - startMillis) / 1000 + " " +
            "seconds reading the code." );
        console.log(
            "- Spent " + (stopMillis - readMillis) / 1000 + " " +
            "seconds processing it." );
    }
}

exports.runCeneSync = function ( files, opt_opts ) {
    var opts = _.opt( opt_opts ).or( {
        args: [],
        in: null,
        out: null
    } ).bam();
    
    if ( !(_.likeArray( files )
        && _.arrAll( files, function ( file ) {
            return typeof file === "string";
        } )) )
        throw new Error();
    if ( !(_.likeArray( opts.args )
        && _.arrAll( opts.args, function ( arg ) {
            return typeof arg === "string";
        } )) )
        throw new Error();
    if ( !(opts.in === null || typeof opts.in === "string") )
        throw new Error();
    if ( !(opts.out === null || typeof opts.out === "string") )
        throw new Error();
    
    runCeneSync( files, [], !"displayTimeInfo",
        opts.args, opts.in, opts.out );
};


if ( require.main === module ) {


var argParser = new argparse.ArgumentParser( {
    version: "0.0.1",
    addHelp: true,
    description: "The Cene programming language."
} );

// Primary interface
argParser.addArgument( [ "-i", "--in" ], {
    action: "store",
    help: "Cene: The file path to use as input, if any."
} );
argParser.addArgument( [ "-o", "--out" ], {
    action: "store",
    help: "Cene: The file path to use as output, if any."
} );
argParser.addArgument( [ "file" ], {
    nargs: "?",
    help: "The path to a Cene file to execute."
} );
argParser.addArgument( [ "args" ], {
    nargs: "*",
    help: "Additional arguments to pass to the Cene program."
} );

// Development interface
argParser.addArgument( [ "-s", "--build-staccato" ], {
    action: "storeTrue",
    help:
        "Staccato: Compile dependencies of " +
        "demos/staccato-runner-mini.html."
} );
argParser.addArgument( [ "-E", "--test-era" ], {
    action: "storeTrue",
    help: "Era reader: Run unit tests."
} );
argParser.addArgument( [ "-S", "--test-mini-staccato" ], {
    action: "storeTrue",
    help:
        "Mini Staccato, a subset of a macro-capable Staccato: Run " +
        "a demo."
} );

var args = argParser.parseArgs();

var tasks = [];


if ( args.test_era ) tasks.push( function ( then ) {
    Function( readInternalFiles( [
        "src/era-misc-strmap-avl.js",
        "src/era-misc.js",
        "test/harness-first.js",
        "src/era-reader.js",
        "test/test-reader.js",
        "test/harness-last.js"
    ] ) )();
    
    process.nextTick( function () {
        then();
    } );
} );


if ( args.build_staccato ) tasks.push( function ( then ) {
    arrEachAsyncNodeExn( [
        { dir: "src/", name: "era-staccato-lib.stc" },
        { dir: "src/", name: "era-staccato-self-compiler.stc" },
        { dir: "test/", name: "test.stc" }
    ], function ( i, file, then ) {
        ltf.readTextFile(
            $path.resolve( __dirname, file.dir + file.name ), "utf-8",
            function ( e, text ) {
            
            if ( e ) return void then( e );
            if ( text === null ) return void then( new Error() );
            
            ltf.writeTextFile(
                $path.resolve( __dirname,
                    "fin/" + file.name + ".js" ),
                "utf-8",
                "\"use strict\";\n" +
                "var rocketnia = rocketnia || {};\n" +
                "rocketnia.eraFiles = rocketnia.eraFiles || {};\n" +
                "rocketnia.eraFiles[ " +
                    _.jsStr( file.name ) + " ] =\n" +
                _.jsStr( text ) + ";\n",
                then );
        } );
    }, function ( e ) {
        if ( e ) return void then( e );
        
        console.log(
            "Copied Staccato files to fin/ as JavaScript files." );
        then();
    } );
} );

var cenePrelude = _.arrMap( [
    "src/era-staccato-lib.stc",
    "src/era-staccato-self-compiler.stc"
], function ( path ) {
    return $path.resolve( __dirname, path );
} );

if ( args.test_mini_staccato ) tasks.push( function ( then ) {
    runCeneSync( cenePrelude, [ "test/test.stc" ],
        !!"displayTimeInfo", [], null, null );
    
    process.nextTick( function () {
        then();
    } );
} );

if ( args.file !== null ) tasks.push( function ( then ) {
    runCeneSync( cenePrelude.concat( [ args.file ] ), [],
        !!"displayTimeInfo", args.args, args.in, args.out );
    
    process.nextTick( function () {
        then();
    } );
} );


if ( tasks.length === 0 ) {
    argParser.printHelp();
} else {
    arrEachAsyncNodeExn( tasks, function ( i, task, then ) {
        task( then );
    }, function ( e ) {
        if ( e ) throw e;
        
        // Do nothing.
    } );
}


}