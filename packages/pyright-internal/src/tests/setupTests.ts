import { initializeWorkersHost } from '../common/workersHost';
import { NodeWorkersHost } from '../common/nodeWorkersHost';

initializeWorkersHost(new NodeWorkersHost());
