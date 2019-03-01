# ForgeRock Login Helper

This library provides a simple interface to the login API provided by [ForgeRock Access Management](https://www.forgerock.com/platform/access-management). It is designed with few assumptions about the environment that it is running within. It only assumes that it runs within a browser environment; there is no dependency on any JavaScript libraries. It is designed to be easy to work with from whichever front-end technology you normally use for web development (React, Angular, Vue, etc...).

The design of this library is "convention over configuration". The library is functional out-of-the-box with only minimum configuration details. Every aspect of the library is designed to be able to be overridden, if necessary. In theory, you should only have to override very specific functions with your own implementation.

The minimum invocation of this library is demonstrated in [sample.html](./sample.html), and you can see the core here:

```javascript
var login = new ForgeRockEmbeddedLogin({
    authenticateUrl: "https://sample.iam.forgeops.com/am/json/realms/root/authenticate",
    loginElement: document.getElementById("loginPanel"),
    successHandler: function() {
        this.loginElement.innerHTML = "Logged In!";
    },
    failureHandler: function() {
        this.loginElement.innerHTML = "Login Failure!";
    }
});

login.startLogin();
```

This code will work with the AM instance specified by the "authenticateUrl" parameter to determine the current state of the user. If they are already logged-in to the AM server, then the "successHandler" will be invoked. If the user needs to log in, then the input fields necessary for the first step of the authentication process will be rendered within the "loginElement" provided. If the user supplies invalid credentials (or if for some other reason AM cannot authenticate the user), the "failureHandler" will be invoked.

It is expected that you will want to customize the way in which the input fields are rendered within your application. You have fine-grained control over this rendering. All you have to do is override the appropriate function with your own implementation. For example, if you want to change the way password fields are rendered, you simply have to override the `renderPasswordCallback` function, like so:

```javascript
login.renderPasswordCallback = function (callback, index, prompt) {
    let el = document.createElement("div");
    el.innerHTML = `<label>${prompt} : <input type="password" name="callback_${index}" value="${callback.input[0].value}"></label>`;
    return Promise.resolve(el.firstElementChild);
};
```

As you can see, this function (and most other functions provided by this library) returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise); This is so that it can support any asynchronous logic your rendering might require.
