const chalk = require('chalk');

function formatMessage(type, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `${type} ${message}`;
    if (data) {
        if (typeof data === 'object') {
            Object.entries(data).forEach(([key, value]) => {
                logMessage += `\n› ${key}: ${value}`;
            });
        } else {
            logMessage += `\n› ${data}`;
        }
    }
    return logMessage;
}

const logger = {
    info: (message, data = null) => {
        console.log(chalk.blue(formatMessage(' INFO ', message, data)));
    },

    error: (message, error) => {
        console.error(chalk.red(formatMessage(' ERROR ', message)));
        if (error && error.stack) {
            console.error(chalk.red(error.stack));
        }
    },

    create: (message, data = null) => {
        console.log(chalk.green(formatMessage('CREATE ', message, data)));
    },

    update: (message, data = null) => {
        console.log(chalk.yellow(formatMessage('UPDATE ', message, data)));
    },

    debug: (message, data = null) => {
        console.log(chalk.gray(formatMessage(' DEBUG ', message, data)));
    }
};

module.exports = logger; 