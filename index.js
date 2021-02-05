import got from 'got';
import tls from 'tls';
import forge from 'node-forge'
import mysql from 'mysql2'

class PSDB {
  constructor(branch = 'development') {
    this.branch = branch;
    this._tokenname = process.env.PSDB_TOKEN_NAME;
    this._token = process.env.PSDB_TOKEN;
    var dbOrg = process.env.PSDB_DB_NAME.split('/')
    this._org = dbOrg[0]
    this._db = dbOrg[1]
    this._baseURL = 'https://api.planetscaledb.io'
    this._headers = {'Authorization': `${this._tokenname}:${this._token}`}
  }
  async createConnection() {
    //todo(nickvanw): at some point we should cache this
    var keys = forge.pki.rsa.generateKeyPair(2048)
    var csr = this.getCSR(keys)
    var data = {'csr': csr}
    var fullURL = `${this._baseURL}/v1/organizations/${this._org}/databases/${this._db}/branches/${this.branch}/create-certificate`
    const {body} = await got.post(fullURL, {
      json: data,
      responseType: 'json',
      headers: this._headers
    });

    const hostPort = body.remote_addr.split(':')

    var sslOpts = {
      servername: `${this._org}/${this._db}/${this.branch}`,
      cert: body.certificate,
      ca: body.certificate_chain,
      key: forge.pki.privateKeyToPem(keys.privateKey),
      rejectUnauthorized: false //todo(nickvanw) this should be replaced by a validation method
    }

    return mysql.createConnection({
      user: 'root',
      database: this._db,
      password: await this.getPassword(),
      stream: tls.connect(hostPort[1], hostPort[0], sslOpts)
    })
  }

  async getPassword() {
    var pwURL = `${this._baseURL}/v1/organizations/${this._org}/databases/${this._db}/branches/${this.branch}/status`
    const {body} = await got.get(pwURL, {
      responseType: 'json',
      headers: this._headers
    })

    return body.mysql_gateway_pass
  }

  getCSR(keys) {
    var csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey
    csr.setSubject([{
      name: 'commonName',
      value: `${this._org}/${this._db}/${this.branch}`
    }])
    csr.version = 1
    csr.siginfo.algorithmOid = 'sha256'
    csr.sign(keys.privateKey)
    return forge.pki.certificationRequestToPem(csr)
  }
}

export default PSDB;


/*
exports.startProxy = function(branch) {
  var tokenName = process.env.PSDB_TOKEN_NAME
  var token = process.env.PSDB_TOKEN
  var dbInfo = process.env.PSDB_DB_NAME.split('/')
  var runnable = childProcess.spawn(pscalePath, ['--service-token-name', tokenName, '--service-token', token, 'connect', '--org', dbInfo[0], dbInfo[1], branch], {
    detached: false
  })
  
  runnable.stdout.on('data', function(data) {
    console.log(data.toString());
  })
}

exports.dbPass = function(branch) {
  var tokenName = process.env.PSDB_TOKEN_NAME
  var token = process.env.PSDB_TOKEN
  var dbInfo = process.env.PSDB_DB_NAME.split('/')

  var command = [pscalePath, '--service-token-name', tokenName, '--service-token', token, 'branch', '--org', dbInfo[0], '--json', 'status', dbInfo[1], branch]

  var branchInfo = childProcess.execSync(command.join(' ')).toString()
  return JSON.parse(branchInfo).password
}

*/
