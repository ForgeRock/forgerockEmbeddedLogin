(function () {
    "use strict";

    let embeddedLogin = function (authenticateUrl) {
        this.authenticateUrl = authenticateUrl;
        return this;
    };

    let findName = (array, name) => array.reduce(
        (found, item) => found || (item.name === name && item), false
    );

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

    embeddedLogin.prototype.success = function () {
        return !!this.currentCallbacks.tokenId;
    };

    embeddedLogin.prototype.failure = function () {
        return typeof this.currentCallbacks.authId === "undefined" &&
            this.currentCallbacks.code === 401;
    };

    embeddedLogin.prototype.renderLogin = function () {
        var needsLoginButton = !this.currentCallbacks.callbacks.reduce((result, callback) =>
                result || ["ConfirmationCallback","PollingWaitCallback","RedirectCallback"].indexOf(callback.type) !== -1,
            false),
            loginCallback = {
                input: {
                    index: this.currentCallbacks.callbacks.length,
                    name: "loginButton",
                    value: 0
                },
                output: [{
                    name: "options",
                    value: [ "Login" ]
                }],
                type: "ConfirmationCallback"
            };

        return Promise.all(
            (needsLoginButton ? this.currentCallbacks.callbacks.concat(loginCallback) : this.currentCallbacks.callbacks)
            .map((callback, index) => this.renderCallback(callback, index))
        ).then(this.joinRenderedCallbacks);
    };

    embeddedLogin.prototype.handleLoginSubmit = function (event) {
        event.preventDefault();
        for (var entry of (new FormData(event.currentTarget))) {
            let callback_entry = entry[0].match(/^callback_(\d+)$/);
            if (callback_entry) {
                this.currentCallbacks.callbacks[parseInt(callback_entry[1], 10)].input[0].value = entry[1];
            }
        }
        return this.submitCallbacks();
    };

    embeddedLogin.prototype.submitCallbacks = function () {
        return fetch(this.authenticateUrl, {
            mode: "cors",
            method: "POST",
            credentials: "include",
            headers: {
                "accept-api-version": "protocol=1.0,resource=2.1",
                "content-type": "application/json"
            },
            body: JSON.stringify(this.currentCallbacks)
        })
        .then((resp) => resp.json())
        .then((jsonResp) => {
            this.currentCallbacks = jsonResp;
            return this.currentCallbacks;
        });
    };

    embeddedLogin.prototype.renderCallback = function (callback, index) {
        let prompt = "",
            promptOutput = findName(callback.output, "prompt");
        if (promptOutput && promptOutput.value && promptOutput.value.length) {
            prompt = promptOutput.value.replace(/:$/, "");
        }

        switch (callback.type) {
            case "NameCallback": return this.renderNameCallback(callback, index, prompt); break;
            case "PasswordCallback": return this.renderPasswordCallback(callback, index, prompt); break;
            case "TextInputCallback": return this.renderTextInputCallback(callback, index, prompt); break;
            case "TextOutputCallback":
                let type = findName(callback.output, "messageType"),
                    message = findName(callback.output, "message");

                // Magic number 4 is for a <script>, taken from ScriptTextOutputCallback.java
                if (type.value === "4") {
                    return this.renderTextOutputScript(index, message.value);
                } else {
                    return this.renderTextOutputMessage(index, message.value, type.value);
                }
            break;
            case "ConfirmationCallback":
                var options = findName(callback.output, "options");

                if (options && options.value !== undefined) {
                    // if there is only one option then mark it as default.
                    let defaultOption = options.value.length > 1
                        ? findName(callback.output, "defaultOption") : { "value": 0 };

                    return Promise.all(
                        options.value.map((option, key) =>
                            this.renderConfirmationCallbackOption(option, index, key, defaultOption && defaultOption.value === key)
                        )
                    );
                } else {
                    return Promise.all([]);
                }
            break;
            case "ChoiceCallback":
                let choiceOutput = findName(callback.output, "choices");
                if (choiceOutput && choiceOutput.value !== undefined) {
                    let choices = choiceOutput.value.map((option, key) => ({
                        active: callback.input.value === key,
                        key,
                        value: option
                    }));
                    return this.renderChoiceCallback(callback, index, prompt, choices);
                } else {
                    return Promise.all([]);
                }
            break;
            case "HiddenValueCallback": return this.renderHiddenValueCallback(callback, index); break;
            case "RedirectCallback":
                let redirectUrl = findName(callback.output, "redirectUrl");
                let redirectMethod = findName(callback.output, "redirectMethod");
                let redirectData = findName(callback.output, "redirectData");

                let form = document.createElement("form");
                form.action = redirectUrl.value;
                form.method = redirectMethod.value;
                if (redirectData && redirectData.value) {
                    redirectData.value.forEach((v, k) => {
                        let input = document.createElement("input");
                        input.type = 'hidden';
                        input.name = k;
                        input.value = v;
                        form.appendChild(input);
                    });
                }
                document.getElementsByTagName("body")[0].appendChild(form);
                form.submit();
                // no return from here, expectation is the page transitions to the redirectUrl
            break;
            case "PollingWaitCallback":
                let pollingWaitTimeoutMs = findName(callback.output, "waitTime").value;

                setTimeout(() => {
                    this.pollingInProgress = true;
                    // figure out how to handle this later
                }, pollingWaitTimeoutMs);
                return this.renderPollingWaitCallback(callback, index, findName(callback.output, "message").value);
            break;
            default: return this.renderUnknownCallback(callback, index); break;
        }
    };

    embeddedLogin.prototype.joinRenderedCallbacks = function (renderedCallbacks) {
        return Promise.resolve(renderedCallbacks.join("<br>\n"));
    };

    embeddedLogin.prototype.renderNameCallback = function (callback, index, prompt) {
        return Promise.resolve(`<input type="text" name="callback_${index}" value="${callback.input[0].value}" placeholder="${prompt}">`);
    };

    embeddedLogin.prototype.renderPasswordCallback = function (callback, index, prompt) {
        return Promise.resolve(`<input type="password" name="callback_${index}" value="${callback.input[0].value}" placeholder="${prompt}">`);
    };

    embeddedLogin.prototype.renderTextInputCallback = function (callback, index, prompt) {
        return Promise.resolve(`<textarea name="callback_${index}">${callback.input[0].value}</textarea>`);
    };

    embeddedLogin.prototype.renderTextOutputScript = function (index, messageValue) {
        return Promise.resolve(`<script type="text/javascript">${messageValue}</script>`);
    };

    embeddedLogin.prototype.renderTextOutputMessage = function (index, messageValue, typeValue) {
        return Promise.resolve(`<div id="callback_${index}" class="${typeValue}">${messageValue}</div>`);
    };

    embeddedLogin.prototype.renderConfirmationCallbackOption = function (option, index, key, isDefault) {
        return Promise.resolve(`<input name="callback_${index}" type="submit" index="${key}" value="${option}">`);
    };

    embeddedLogin.prototype.renderChoiceCallback = function (callback, index, prompt, choices) {
        return Promise.resolve(
            `<label for="callback_${index}" id="label_callback_${index}">${prompt}</label>
            <select name="callback_${index}" id="callback_${index}">
            ${choices.map((choice) => `<option value="${choice.key}" ${choice.active ? "selected" : ""}>${choice.value}</option>`)}
            </select>`
        );
    };

    embeddedLogin.prototype.renderHiddenValueCallback = function (callback, index) {
        return Promise.resolve(`<input type="hidden" id="${callback.input.value}" aria-hidden="true" name="callback_${index}" value="" />`);
    };

    embeddedLogin.prototype.renderPollingWaitCallback = function (callback, index, message) {
        return Promise.resolve(`<h4>${message}</h4>`);
    }

    embeddedLogin.prototype.renderUnknownCallback = function (callback, index) {
        return this.renderNameCallback(callback, index);
    };

    module.exports = embeddedLogin;

}());
