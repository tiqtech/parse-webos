enyo.kind({
    name:"Parse.RestClient",
    kind:"Component",
    statics:{
        key:"Parse.RestClient.User",
        user:(function() {
            if(localStorage) {
                var s = localStorage.getItem("Parse.RestClient.User");
                if(s) {
                    return enyo.json.parse(s);
                }
            }

            return "";
        })(),
        setUser:function(user, applicationId) {
            this.user = user;
            if(localStorage) {
                if(this.user) {
                    localStorage.setItem(this.key, enyo.json.stringify(user));    
                } else {
                    localStorage.removeItem(this.key);
                }
            }
        },
        currentUser:function() {
            return this.user;
        }
    },
    published:{
        applicationId:"",
        key:""
    },
    events:{
        onAdd:"",
        onUpdate:"",
        onGet:"",
        onRemove:"",
        onSearch:"",
        onError:"",
        onCreateUser:"",
        onRemoveUser:"",
        onLogin:"",
        onBatch:""
    },
    handlers:{
        onLogin:"loginHandler",
        onCreateUser:"loginHandler"
    },
    parse:{
        host:"api.parse.com",
        version:"1"
    },
    reservedFields: {__type:1, createdAt:1, updatedAt:1, className:1},
    getPath:function(endpoint, className, id) {
        var p = ["",this.parse.version,endpoint];

        if(className) {
            p.push(className);
        }

        if(id) {
            p.push(id);
        }
        
        return p.join("/");
    },
    getAjax:function(config) {
        var params = {
            method:config.method,
            url:"https://"+this.parse.host+this.getPath(config.endpoint, config.className, config.id),
            //cacheBust:true,
            contentType:"text/plain",
            headers:{
                "X-Parse-Application-Id":this.applicationId,
                "X-Parse-REST-API-Key":this.key
            }
        };

        if(Parse.RestClient.user) {
            params.headers["X-Parse-Session-Token"] = Parse.RestClient.user.sessionToken;
        }

        return new enyo.Ajax(params);
    },
    call:function(config) {
        if(this.batchMode) {
            this.commands.push(config);
            return;
        }

        var x = this.getAjax(config);

        config.data = (config.data instanceof Object && config.method != "GET") ? enyo.json.stringify(config.data) : config.data;

        x.go(config.data);
        x.error(this, function(sender, response) {
            var e = {error:"Unknown Error", code:response};

            if(sender.xhrResponse.body) {
                try {
                    enyo.mixin(e, enyo.json.parse(sender.xhrResponse.body));
                } catch(x) {}
            }

            this.doError(e);
            if(config.callback) {
                config.callback(sender, e);
            }
        });

        if(config.event) {
            x.response(this, function(sender, response) {
                var stop = false;
                var e = {
                    response:response,
                    stop:function() {
                        stop = true;
                    }
                };
                
                this[config.event](e);
                
                if(stop) {
                    x.fail();
                } else {
                    return response;
                }
            });
        }

        if(config.callback) {
            x.response(function(sender, response) {
                config.callback(sender, {response:response});
            });
        }
    },
    clean:function(o) {
        if(o) {
            for(var k in this.reservedFields) {
                delete o[k];
            }
        }
    },
    add:function(className, o, callback) {
        this.clean(o);

        this.call({
            endpoint:"classes",
            className:className,
            method:"POST",
            data:o,
            event:"doAdd",
            callback:callback
        });
    },
    get:function(className, id, callback) {
        this.call({
            endpoint:"classes",
            className:className,
            method:"GET",
            id:id,
            event:"doGet",
            callback:callback
        });
    },
    update:function(className, o, callback) {
        this.clean(o);

        this.call({
            endpoint:"classes",
            className:className,
            method:"PUT",
            id:o.objectId,
            data:o,
            event:"doUpdate",
            callback:callback
        });
    },
    search:function(className, query, callback) {
        for(var k in query) {
            if(query[k] instanceof Object) {
                query[k] = enyo.json.stringify(query[k]);
            }
        }

        this.call({
            endpoint:"classes",
            className:className,
            method:"GET",
            data:query,
            event:"doSearch",
            callback:callback
        });
    },
    remove:function(className, id, callback) {
        this.call({
            endpoint:"classes",
            className:className,
            method:"DELETE",
            id:id,
            event:"doRemove",
            callback:callback
        });
    },
    batch:function(commands, callback) {
        if(enyo.isArray(commands)) {
            commands = {requests:commands};
        }

        this.call({
            endpoint:"batch",
            method:"POST",
            data:commands,
            event:"doBatch",
            callback:callback
        });
    },
    batchSession:function(sessionFunction, callback) {
        this.commands = [];
        this.batchMode = true;

        sessionFunction(this);

        var requests = [],
            me = this;

        enyo.forEach(this.commands, function(config) {
            requests.push({
                method:config.method,
                path:me.getPath(config.endpoint, config.className, config.id),
                body:config.data
            });
        });

        this.commands = null;
        this.batchMode = false;
        this.batch({requests:requests}, callback);
    },
    run:function(name, args, callback) {
        this.call({
            endpoint:"functions",
            className:name,
            method:"POST",
            data:args || "{}",
            callback:callback
        });
    },
    createUser:function(username, password, data, callback) {
        // remap callback when data is omitted
        if(enyo.isFunction(data)) {
            callback = data;
            data = {};
        }

        enyo.mixin(data, {
            username:username,
            password:password
        });

        this.call({
            endpoint:"users",
            method:"POST",
            event:"doCreateUser",
            data:enyo.json.stringify(data),
            callback:callback
        });
    },
    removeUser:function(id, callback) {
        this.call({
            endpoint:"users",
            method:"DELETE",
            id:id,
            event:"doRemoveUser",
            callback:callback
        });
    },
    requestPasswordReset:function(email, callback) {
        this.call({
            endpoint:"requestPasswordReset",
            method:"POST",
            data:{email:email},
            callback:callback
        });
    },
    login:function(username, password, callback) {
        this.call({
            endpoint:"login",
            method:"GET",
            event:"doLogin",
            data:{username:username, password:password},
            callback:callback
        });
    },
    logout:function() {
        Parse.RestClient.setUser();
    },
    loginHandler:function(sender, event) {
        // store session key on successful login
        if(event.response) {
            Parse.RestClient.setUser(event.response);
        }
    },
    currentUser:function() {
        return Parse.RestClient.currentUser();
    }
});
