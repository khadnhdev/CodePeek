const chalk = require('chalk');

const logger = {
    create: (title, data) => {
        console.log('\n' + chalk.bgGreen.black(' CREATE ') + ' ' + chalk.green(title));
        if (data) {
            Object.entries(data).forEach(([key, value]) => {
                console.log(chalk.green('›') + ' ' + chalk.bold(key + ':'), 
                    typeof value === 'string' && value.length > 100 
                        ? value.substring(0, 100) + '...' 
                        : value
                );
            });
        }
    },

    update: (title, data) => {
        console.log('\n' + chalk.bgBlue.black(' UPDATE ') + ' ' + chalk.blue(title));
        if (data) {
            Object.entries(data).forEach(([key, value]) => {
                console.log(chalk.blue('›') + ' ' + chalk.bold(key + ':'), 
                    typeof value === 'string' && value.length > 100 
                        ? value.substring(0, 100) + '...' 
                        : value
                );
            });
        }
    },

    error: (title, error) => {
        console.log('\n' + chalk.bgRed.white(' ERROR ') + ' ' + chalk.red(title));
        if (error) {
            console.log(chalk.red('›') + ' ' + error.message);
            if (error.stack) {
                console.log(chalk.red('›') + ' Stack:', error.stack);
            }
        }
    }
};

module.exports = logger; 