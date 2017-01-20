'use strict';
const { ipcRenderer, webFrame } = require('electron');
const MenuHandler = require('../handlers/menu');
const ShareMenu = require('./share_menu');
const MentionMenu = require('./mention_menu');
const BadgeCount = require('./badge_count');
const Common = require('../common');


// 触发器都在这里，触发开启界面相关的代码，这里是扫码登录后的流程？？？
class Injector {
  init() {
    if (Common.DEBUG_MODE) {
      Injector.lock(window, 'console', window.console);
    }
    this.initInjectBundle();
    this.initAngularInjection();
    webFrame.setZoomLevelLimits(1, 1);

    new MenuHandler().create();
  }

    //不理解 = =
  initAngularInjection() {
    const self = this;
    const angular = window.angular = {};
    let angularBootstrapReal;
      //定义使用Object.defineProperty创建一个不能被修改的对象的属性。
    Object.defineProperty(angular, 'bootstrap', 
        {get: () => angularBootstrapReal //一旦被访问就会回调这个函数，并且将值返回给用户
                ? function (element, moduleNames) { //如果angluarboststrapreal是真，就调用这个函数
        const moduleName = 'webwxApp';
        if (moduleNames.indexOf(moduleName) < 0) return;//no such key

        let constants = null;
        angular.injector(['ng', 'Services']).invoke(['confFactory', (confFactory) => (constants = confFactory)]);

        angular.module(moduleName).config(['$httpProvider', ($httpProvider) => {
          $httpProvider.defaults.transformResponse.push((value) => {
            return self.transformResponse(value, constants);
          });
        },
            //感觉是各种依赖注入
        ]).run(['$rootScope', ($rootScope) => {
            //login函数
          ipcRenderer.send('wx-rendered', MMCgi.isLogin);
            //登陆成功

          $rootScope.$on('newLoginPage', () => {
            ipcRenderer.send('user-logged', '');
          });
          $rootScope.shareMenu = ShareMenu.inject;
          $rootScope.mentionMenu = MentionMenu.inject;
        }]);
        return angularBootstrapReal.apply(angular, arguments);
      }
                : angularBootstrapReal, set: (real) => (angularBootstrapReal = real)
    });//Object.defineProperty
  }

  initInjectBundle() {
    const initModules = () => {
      if (!window.$) {
        return setTimeout(initModules, 3000);
      }

      MentionMenu.init();
      BadgeCount.init();
    };

    window.onload = () => {
      initModules();
      window.addEventListener('online', () => {
        ipcRenderer.send('reload', true);
      });
    };
  }

  transformResponse(value, constants) {
    if (!value) return value;

    switch (typeof value) {
      case 'object':
        /* Inject emoji stickers and prevent recalling. */
        return this.checkEmojiContent(value, constants);
      case 'string':
        /* Inject share sites to menu. */
        return this.checkTemplateContent(value);
    }
    return value;
  }

    //看起来是某种用于给不可写对象绑定值得函数
  static lock(object, key, value) {
    return Object.defineProperty(object, key, {
      get: () => value,
      set: () => {
      },
    });
  }

    //处理emoji表情
  checkEmojiContent(value, constants) {
    if (!(value.AddMsgList instanceof Array)) return value;
    value.AddMsgList.forEach((msg) => {
      switch (msg.MsgType) {
        case constants.MSGTYPE_EMOTICON:
          Injector.lock(msg, 'MMDigest', '[Emoticon]');
          Injector.lock(msg, 'MsgType', constants.MSGTYPE_EMOTICON);
          if (msg.ImgHeight >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', { height: `${Common.EMOJI_MAXIUM_SIZE}px`, width: 'initial' });
          } else if (msg.ImgWidth >= Common.EMOJI_MAXIUM_SIZE) {
            Injector.lock(msg, 'MMImgStyle', { width: `${Common.EMOJI_MAXIUM_SIZE}px`, height: 'initial' });
          }
          break;
        case constants.MSGTYPE_RECALLED:
          Injector.lock(msg, 'MsgType', constants.MSGTYPE_SYS);
          Injector.lock(msg, 'MMActualContent', Common.MESSAGE_PREVENT_RECALL);
          Injector.lock(msg, 'MMDigest', Common.MESSAGE_PREVENT_RECALL);
          break;
      }
    });
    return value;
  }

  checkTemplateContent(value) {
      //匹配正则
    const optionMenuReg = /optionMenu\(\);/;
    const messageBoxKeydownReg = /editAreaKeydown\(\$event\)/;
    if (optionMenuReg.test(value)) {
      value = value.replace(optionMenuReg, 'optionMenu();shareMenu();');
    } else if (messageBoxKeydownReg.test(value)) {
      value = value.replace(messageBoxKeydownReg, 'editAreaKeydown($event);mentionMenu($event);');
    }
    return value;
  }
}

new Injector().init();
