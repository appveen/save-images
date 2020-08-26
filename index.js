const os = require('os');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const dateformat = require('dateformat');
const { exec, execSync } = require('child_process');

let WORKSPACE = '/var/lib/jenkins/workspace';
const repoList = [
    {
        name: "odp-b2b-agent",
        latest: "LATEST_B2BGW",
        tag: "b2bgw"
    },
    {
        name: "odp-b2b-backend-generator",
        latest: "LATEST_B2B",
        tag: "b2b"
    },
    {
        name: "odp-b2b-partner-manager",
        latest: "LATEST_PM",
        tag: "pm"
    },
    {
        name: "odp-deployment-manager",
        latest: "LATEST_DM",
        tag: "dm"
    },
    {
        name: "odp-gateway",
        latest: "LATEST_GW",
        tag: "gw"
    },
    {
        name: "odp-monitoring",
        latest: "LATEST_MON",
        tag: "mon"
    },
    {
        name: "odp-notification-engine",
        latest: "LATEST_NE",
        tag: "ne"
    },
    {
        name: "odp-security",
        latest: "LATEST_SEC",
        tag: "sec"
    },
    {
        name: "odp-service-manager",
        latest: "LATEST_SM",
        tag: "sm"
    },
    {
        name: "odp-workflow",
        latest: "LATEST_WF",
        tag: "wf"
    },
    {
        name: "odp-user-management",
        latest: "LATEST_USER",
        tag: "user"
    },
    {
        name: "odp-proxy",
        latest: "LATEST_PROXY",
        tag: "nginx"
    }
];

(async () => {
    try {
        const answers = await inquirer.prompt([
            {
                message: 'Choose Workspace',
                choices: ['jenkins', 'orcli'],
                type: 'list',
                name: 'workspace',
                default: 'jenkins'
            },
            {
                when: (answers) => answers.workspace === 'orcli',
                message: 'Code Base Branch',
                type: 'input',
                name: 'branch',
            },
            {
                message: 'Choose modules to save',
                choices: repoList.map(e => e.tag),
                type: 'checkbox',
                name: 'repoList',
            },
            {
                when: (answers) => answers.repoList.length > 0,
                message: 'Enter Release',
                type: 'input',
                name: 'release',
            },
            {
                when: (answers) => answers.repoList.length > 0,
                message: 'Enter new Tag',
                type: 'input',
                name: 'tag',
            }
        ]);

        if (!answers.release || !answers.tag) {
            console.log(chalk.red('Please provied all info!'))
            process.exit(0);
        }
        const IMAGES_DIR = path.join(os.homedir(), 'SAVED_IMAGES', dateformat(Date.now(), 'yyyy-mm-dd'));
        try {
            execSync(`mkdir -p ${IMAGES_DIR}`);
        } catch (e) {
            console.log(chalk.red(`*****************************************************`));
            console.log(chalk.red(`ERROR`));
            console.log(chalk.red(`*****************************************************`));
            console.log(e);
            console.log(chalk.red(`*****************************************************`));
            process.exit(0);
        }
        if (answers.workspace === 'orcli') {
            if (['dev', 'perf', 'data.stack', 'data-stack'].indexOf(answers.branch) == -1 && answers.branch.split('/').length == 1) {
                answers.branch = 'release/' + answers.branch;
            }
            WORKSPACE = path.join(os.homedir(), 'orcli_workspace', answers.branch);
        }
        const final = await answers.repoList.reduce((prev, curr) => {
            return prev.then(() => {
                return saveImage({ IMAGES_DIR, WORKSPACE }, answers, curr);
            });
        }, Promise.resolve());
        process.chdir(IMAGES_DIR);
        console.log(chalk.green(`*****************************************************`));
        console.log(chalk.green(`Process Complete!`));
        console.log(chalk.green(`IMAGES AT :: ${IMAGES_DIR}`));
        console.log(chalk.green(`*****************************************************`));
    } catch (err) {
        console.log(chalk.red(err.message), err);
    }
})();


function saveImage(dirs, answers, module) {
    return new Promise((resolve, reject) => {
        console.log(chalk.green(`*****************************************************`));
        console.log(chalk.green(`Saving image for ${module}`));
        console.log(chalk.green(`*****************************************************`));
        const repo = repoList.find(e => e.tag === module);
        let latestFile = `LATEST_${module.toUpperCase()}`;
        if (module === 'nginx') {
            latestFile = `LATEST_PROXY`;
        }
        process.chdir(dirs.WORKSPACE);
        const LATEST_BUILD = fs.readFileSync(latestFile, 'utf-8').trim();
        const yamlContents = fs.readFileSync(`${repo.name}/${module}.yaml`, 'utf-8');
        const lines = yamlContents.split('\n');
        const newLines = [];
        lines.forEach(line => {
            if (line.indexOf('imagePullSecrets') == -1 && line.indexOf('name: regsecret') == -1) {
                line = line.replace(/__release_tag__/g, answers.release);
                line = line.replace(/__release__/g, answers.tag);
            }
            newLines.push(line);
        });
        process.chdir(dirs.IMAGES_DIR);
        const imageFrom = `odp:${module}.${LATEST_BUILD}`;
        const imageTo = `odp:${module}.${answers.tag}`;
        const saveTo = `odp_${module}.${answers.tag}.tar`;
        const yamlFile = `${module}.${answers.tag}.yaml`;
        try {
            fs.unlinkSync(yamlFile);
        } catch (e) {

        }
        try {
            fs.unlinkSync(saveTo);
        } catch (e) {

        }
        try {
            fs.unlinkSync(saveTo + '.bz2');
        } catch (e) {

        }
        fs.writeFileSync(yamlFile, newLines.join('\n'), 'utf-8');
        exec(`docker tag ${imageFrom} ${imageTo}`, function (err, stdout, stderr) {
            if (err) {
                return reject(err);
            }
            console.log(stdout);
            console.log(stderr);
            exec(`docker save -o ${saveTo} ${imageTo} && bzip2 ${saveTo}`, function (err, stdout, stderr) {
                if (err) {
                    return reject(err);
                }
                console.log(stdout);
                console.log(stderr);
                if (module == 'sm') {
                    exec(`docker tag odp:base.dev odp:base.${answers.release} && docker save -o odp_base.${answers.release}.tar odp:base.${answers.release} && bzip2 odp_base.${answers.release}.tar`, function (err, stdout, stderr) {
                        if (err) {
                            return reject(err);
                        }
                        console.log(stdout);
                        console.log(stderr);
                        resolve();
                    });
                } else if (module == 'b2b') {
                    exec(`docker tag odp:b2b.runner.dev odp:b2b.runner.${answers.release} && docker save -o odp_b2b.runner.${answers.release}.tar odp:b2b.runner.${answers.release} && bzip2 odp_b2b.runner.${answers.release}.tar`, function (err, stdout, stderr) {
                        if (err) {
                            return reject(err);
                        }
                        console.log(stdout);
                        console.log(stderr);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });
    });
}