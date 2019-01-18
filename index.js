(function () {
    "use strict";

    var embeddedLogin = function (authenticateUrl) {
        this.authenticateUrl = authenticateUrl;
        return this;
    };

    embeddedLogin.prototype.startLogin = function () {
        return fetch(this.authenticateUrl, {
            mode: "cors",
            method: "POST",
            credentials: "include",
            headers: {
                "accept-api-version": "protocol=1.0,resource=2.1"
            }
        })
        .then((resp) => resp.json())
        .then((jsonResp) => {
            this.currentCallbacks = jsonResp;
            return this.currentCallbacks;
        });
    };

    embeddedLogin.prototype.submitCredentials = function (credentials) {
        var input = this.currentCallbacks;
        input.callbacks = input.callbacks.map(function (callback, index) {
            if (credentials[index]) {
                callback.input[0].value = credentials[index];
            }
            return callback;
        });

        return fetch(this.authenticateUrl, {
            mode: "cors",
            method: "POST",
            credentials: "include",
            headers: {
                "accept-api-version": "protocol=1.0,resource=2.1",
                "content-type": "application/json"
            },
            body: JSON.stringify(input)
        })
        .then((resp) => resp.json())
        .then((jsonResp) => {
            this.currentCallbacks = jsonResp;
            return this.currentCallbacks;
        });
    };

    embeddedLogin.prototype.success = function () {
        return !!this.currentCallbacks.tokenId;
    };


    module.exports = embeddedLogin;

}());
