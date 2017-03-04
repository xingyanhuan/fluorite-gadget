/*
	[api_sql_tiny_test.js]

	encoding=utf-8
*/

var chai = require("chai");
var assert = chai.assert;
var expect = chai.expect;
var sinon = require("sinon");
var shouldFulfilled = require("promise-test-helper").shouldFulfilled;
var shouldRejected  = require("promise-test-helper").shouldRejected;
require('date-utils');

const api_sql = require("../src/api_sql_tiny.js");

var TEST_CONFIG_SQL = { // テスト用
	user : "fake_user",
	password : "fake_password",
	server : "fake_server_url", // You can use 'localhost\\instance' to connect to named instance
	database : "fake_db_name",
	stream : false,  // if true, query.promise() is NOT work! // You can enable streaming globally

	// Use this if you're on Windows Azure
	options : {
		// database : process.env.SQL_DATABASE, // コレ要る？
		encrypt : true 
	} // It works well on LOCAL SQL Server if this option is set.
};


describe( "api_sql_tiny.js", function(){

    /**
     * api_vi_batterylog_xxx() のテストで共通的な
     * Stub生成、フック、リストアを行う。
     * (※今回限りなので、prototypeじゃなくてコンストラクタでメソッド定義)
     */
    function ApiCommon_StubAndHooker(){
        this.original_prop= {};
        this.createStubs = function(){
            return {
                "CONFIG_SQL" : TEST_CONFIG_SQL, 
                "mssql" : { "close" : sinon.stub() },
                "sql_parts" : {
                    "createPromiseForSqlConnection" : sinon.stub(),
                    "isOwnerValid" : sinon.stub(),
                    "getShowObjectFromGetData" : sinon.stub(),
                    "getListOfBatteryLogWhereDeviceKey" : sinon.stub()
                }
            };
        };
        /**
         * メソッドをフックしてStubに差し替える。
         * ※オリジナルはバックアップしておく。
         *   「全ての関数をstub outする」の適切か否か不明。
         *   spy使うなら、オリジナルも必要。⇒なので毎回戻して、次回利用可能にしておく。
         */
        this.hookInstance = function( apiInstance, stubs ){
            var stub_keys = Object.keys( stubs );
            var n = stub_keys.length;

            // オリジナルをバックアップする。
            n = stub_keys.length;
            while( 0<n-- ){
                this.original_prop[ stub_keys[n] ] = apiInstance.factoryImpl[ stub_keys[n] ].getInstance();
            }

            // stubを用いてフックする。
            n = stub_keys.length;
            while( 0<n-- ){
                apiInstance.factoryImpl[ stub_keys[n] ].setStub( stubs[ stub_keys[n] ] );
            }
        };
        this.restoreOriginal = function( apiInstance ){
            var n = stub_keys.length;
            while( 0<n-- ){
                apiInstance.factoryImpl[ stub_keys[n] ].setStub( this.original_prop[ stub_keys[n] ] );
            }

        };
    };
    var COMMON_STUB_MANAGER = new ApiCommon_StubAndHooker();



    describe("::api_v1_batterylog_show()", function(){
        var api_v1_batterylog_show = api_sql.api_v1_batterylog_show;
        var stubs;

        beforeEach(function(){ // 内部関数をフックする。
            stubs = COMMON_STUB_MANAGER.createStubs();
            stub_keys = Object.keys( stubs );

            COMMON_STUB_MANAGER.hookInstance( api_sql, stubs );
        });
        afterEach(function(){
            COMMON_STUB_MANAGER.restoreOriginal( api_sql );
        });  // 今は無し。

        // ここからテスト。
        it("正常系", function(){
            var stub_response =  { "writeJsonAsString" : sinon.stub() };
            var queryFromGet = { "device_key" : "ほげふがぴよ" };
            var dataFromPost = null;
            var expectedInputData = { 
                "owner_hash" : queryFromGet.device_key,
                "date_start" : "2017-02-01", // queryGetに無い場合でも、、デフォルトを生成する。
                "date_end"   : "2017-02-14"  // 上同。
            };
            var expectedRecordset = [
                {"created_at":"2017-02-08T00:47:25.000Z","battery":91},
                {"created_at":"2017-02-11T12:36:01.000Z","battery":77}
            ];

            // beforeEach()で準備される stub に対して、動作を定義する。
            stubs.sql_parts.createPromiseForSqlConnection.onCall(0).returns(
                Promise.resolve( expectedInputData )
            );
            stubs.sql_parts.isOwnerValid.onCall(0).returns(
                Promise.resolve()
            );
            stubs.sql_parts.getShowObjectFromGetData.onCall(0).returns( expectedInputData );
            // 【ToDo】↑ここはspyで良いのかもしれないが、、、上手く実装できなかったのでstubで。stubで悪いわけではない。
            stubs.sql_parts.getListOfBatteryLogWhereDeviceKey.onCall(0).returns(
                Promise.resolve( expectedRecordset )
            );

            return shouldFulfilled(
                api_v1_batterylog_show( stub_response, queryFromGet, dataFromPost )
            ).then(function(){
                var stubCreateConnection = stubs.sql_parts.createPromiseForSqlConnection;
                var stubList = stubs.sql_parts.getListOfBatteryLogWhereDeviceKey;
                var stubWrite = stub_response.writeJsonAsString;

                assert( stubs.sql_parts.getShowObjectFromGetData.calledOnce );
                expect( stubs.sql_parts.getShowObjectFromGetData.getCall(0).args[0] ).to.equal(queryFromGet);

                assert( stubCreateConnection.calledOnce );
                expect( stubCreateConnection.getCall(0).args[0] ).to.be.an('object');
                expect( stubCreateConnection.getCall(0).args[1] ).to.have.ownProperty('owner_hash');

                assert( stubs.sql_parts.isOwnerValid.calledOnce );
                expect( stubs.sql_parts.isOwnerValid.getCall(0).args[0] ).to.equal( TEST_CONFIG_SQL.database );
                expect( stubs.sql_parts.isOwnerValid.getCall(0).args[1] ).to.equal( queryFromGet.device_key );
                
                assert( stubList.calledOnce );
                expect( stubList.getCall(0).args[0] ).to.equal( TEST_CONFIG_SQL.database );
                expect( stubList.getCall(0).args[1] ).to.equal( queryFromGet.device_key );
                expect( stubList.getCall(0).args[2] ).to.deep.equal({
                    "start" : expectedInputData.date_start,
                    "end"   : expectedInputData.date_end 
                });

                assert( stubs.mssql.close.calledOnce );
                assert( stubWrite.calledOnce );
                expect( stubWrite.getCall(0).args[0].table ).to.deep.equal( expectedRecordset );
            });
        });

        // ◆異常系は、まとめてテスト（関数定義して、それをit()に渡す）べきか？
        it("異常系：認証NGなら、401を返す");
        // メモ⇒レートリミットはShowとaddで変更する。
        it("異常系：レートリミット違反なら（アクセス時間間隔）、503を返す");
        it("異常系：その他のエラーなら503を返す");
    });

    // ↓内部関数のフックは、show（）と共通化すべきカナ？
    describe("::api_v1_batterylog_add()", function(){
        var api_v1_batterylog_add = api_sql.api_v1_batterylog_add;
        var stubs;

        beforeEach(function(){ // 内部関数をフックする。
            stubs = COMMON_STUB_MANAGER.createStubs();
            stub_keys = Object.keys( stubs );

            COMMON_STUB_MANAGER.hookInstance( api_sql, stubs );
        });
        afterEach(function(){});  // 今は無し。

        it("正常系");
        it("異常系：認証NGなら、401を返す");
        it("異常系：レートリミット違反なら（時間当たりの回数超過）、503を返す");
        it("異常系：その他のエラーなら503を返す");
    });
    describe("::api_v1_batterylog_delete()", function(){
        var api_v1_batterylog_delete = api_sql.api_v1_batterylog_delete;
        var stubs;

        beforeEach(function(){ // 内部関数をフックする。
            stubs = COMMON_STUB_MANAGER.createStubs();
            stub_keys = Object.keys( stubs );

            COMMON_STUB_MANAGER.hookInstance( api_sql, stubs );
        });
        afterEach(function(){});  // 今は無し。

        it("正常系");
        it("異常系：認証NGなら、401を返す");
        it("異常系：レートリミット違反なら（時間当たりの回数超過？）、503を返す");
        it("異常系：その他のエラーなら503を返す");
    });
});
/*
    参照先Webページメモ
    http://chaijs.com/api/bdd/
    http://sinonjs.org/docs/
    http://qiita.com/xingyanhuan/items/da9f814ce4bdf8f80fa1
    http://azu.github.io/promises-book/#basic-tests
*/





