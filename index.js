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
        name: "ds-b2b-agent",
        latest: "LATEST_B2BGW",
        tag: "b2bgw"
    },
    {
        name: "ds-b2b-partner-manager",
        latest: "LATEST_PM",
        tag: "pm"
    },
    {
        name: "ds-deployment-manager",
        latest: "LATEST_DM",
        tag: "dm"
    },
    {
        name: "ds-gateway",
        latest: "LATEST_GW",
        tag: "gw"
    },
    {
        name: "ds-monitoring",
        latest: "LATEST_MON",
        tag: "mon"
    },
    {
        name: "ds-notification-engine",
        latest: "LATEST_NE",
        tag: "ne"
    },
    {
        name: "ds-security",
        latest: "LATEST_SEC",
        tag: "sec"
    },
    {
        name: "ds-service-manager",
        latest: "LATEST_SM",
        tag: "sm"
    },
    {
        name: "ds-user-management",
        latest: "LATEST_USER",
        tag: "user"
    },
    {
        name: "ds-proxy",
        latest: "LATEST_PROXY",
        tag: "proxy"
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
            // {
            //     when: (answers) => answers.repoList.length > 0,
            //     message: 'Enter Repository URL (if any)',
            //     type: 'input',
            //     name: 'repository',
            // },
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
        const TEMP_BUILDS_DIR = path.join(os.tmpdir(), 'TEMP_BUILDS');
        try {
            execSync(`mkdir -p ${IMAGES_DIR}`);
            execSync(`mkdir -p ${TEMP_BUILDS_DIR}`);
        } catch (e) {
            console.log(chalk.red(`*****************************************************`));
            console.log(chalk.red(`ERROR`));
            console.log(chalk.red(`*****************************************************`));
            console.log(e);
            console.log(chalk.red(`*****************************************************`));
            process.exit(0);
        }
        if (answers.workspace === 'orcli') {
            // if (['dev', 'perf', 'data.stack', 'data-stack', 'dedupe'].indexOf(answers.branch) == -1 && answers.branch.split('/').length == 1) {
            //     answers.branch = 'release/' + answers.branch;
            // }
            WORKSPACE = path.join(os.homedir(), 'orcli_workspace', answers.branch);
        }
        const final = await answers.repoList.reduce((prev, curr) => {
            return prev.then(() => {
                return saveImage({ IMAGES_DIR, WORKSPACE, TEMP_BUILDS_DIR }, answers, curr);
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
        let imageFrom;
        let imageTo;
        let saveTo;
        let yamlFile;
        imageFrom = `data.stack:${module}.${LATEST_BUILD}`;
        imageTo = `data.stack:${module}.${answers.tag}`;
        // if (answers.repository && answers.repository.trim()) {
        //     imageTo = repository + '/' + imageTo;
        // }
        saveTo = `data.stack_${module}.${answers.tag}.tar`;
        yamlFile = `${module}.${answers.tag}.yaml`;
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
        fs.writeFileSync(path.join(dirs.TEMP_BUILDS_DIR, 'Dockerfile'), `FROM ${imageFrom}\nENV IMAGE_TAG=${answers.tag}`, 'utf-8');
        let logs = execSync(`docker build -t ${imageTo} .`, {
            cwd: dirs.TEMP_BUILDS_DIR
        });
        console.log(logs.toString('utf-8'));
        logs = execSync(`docker save -o ${saveTo} ${imageTo} && bzip2 ${saveTo}`, {
            cwd: dirs.IMAGES_DIR
        });
        // if (answers.repository && answers.repository.trim()) {
        //     logs = execSync(`docker push ${imageTo}`);
        // }
        console.log(logs.toString('utf-8'));
        logs = Buffer.from('');
        if (module == 'sm') {
            logs = execSync(`docker tag data.stack:base.${LATEST_BUILD} data.stack:base.${answers.tag} && docker save -o data.stack_base.${answers.tag}.tar data.stack:base.${answers.tag} && bzip2 data.stack_base.${answers.tag}.tar`, {
                cwd: dirs.IMAGES_DIR
            });
        } else if (module == 'pm') {
            logs = execSync(`docker tag data.stack:b2b.base.${LATEST_BUILD} data.stack:b2b.base.${answers.tag} && docker save -o data.stack_b2b.base.${answers.tag}.tar data.stack:b2b.base.${answers.tag} && bzip2 data.stack_b2b.base.${answers.tag}.tar`, {
                cwd: dirs.IMAGES_DIR
            });
            logs = execSync(`docker tag data.stack:faas.base.${LATEST_BUILD} data.stack:faas.base.${answers.tag} && docker save -o data.stack_faas.base.${answers.tag}.tar data.stack:faas.base.${answers.tag} && bzip2 data.stack_faas.base.${answers.tag}.tar`, {
                cwd: dirs.IMAGES_DIR
            });
        }
        console.log(logs.toString('utf-8'));
        resolve();
    });
}